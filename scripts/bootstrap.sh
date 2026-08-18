#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-chat.muhbianco.com.br}"
STOAT_DIR="${STOAT_DIR:-/usr/src/stoat}"
MUCHAT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$STOAT_DIR"
if [[ ! -f "$STOAT_DIR/compose.yml" ]]; then
  git clone --depth 1 https://github.com/stoatchat/self-hosted.git "$STOAT_DIR"
fi

copy_overlay() {
  cp -a "$MUCHAT_DIR/Caddyfile" "$STOAT_DIR/Caddyfile"
  cp -a "$MUCHAT_DIR/compose.override.yml" "$STOAT_DIR/compose.override.yml"
  rm -rf "$STOAT_DIR/sso"
  cp -a "$MUCHAT_DIR/sso" "$STOAT_DIR/sso"
}

copy_overlay
cd "$STOAT_DIR"

if [[ ! -f Revolt.toml ]]; then
  printf 'y\nY\n' | ./generate_config.sh "$DOMAIN"
  copy_overlay
fi

if ! grep -q '^SSO_SECRET=' .env 2>/dev/null; then
  printf 'SSO_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi

python3 - <<'PY'
from pathlib import Path

p = Path("Revolt.toml")
text = p.read_text(encoding="utf-8")
text = text.replace("voice_quality = 16000", "voice_quality = 48000")
text = text.replace("video_resolution = [1080, 720]", "video_resolution = [1920, 1080]")
text = text.replace("video_resolution = [1280, 720]", "video_resolution = [1920, 1080]")
text = text.replace("attachments = 20_000_000", "attachments = 50_000_000")
text = text.replace("body_limit_size = 20_000_000", "body_limit_size = 55_000_000")
p.write_text(text, encoding="utf-8")

live = Path("livekit.yml")
t = live.read_text(encoding="utf-8")
if "udp_port:" not in t:
    t = t.replace(
        "turn:\n  enabled: false",
        "turn:\n  enabled: true\n  udp_port: 3478",
    )
    live.write_text(t, encoding="utf-8")
print("patched Revolt.toml and livekit.yml")
PY

echo "overlay pronto em $STOAT_DIR"
