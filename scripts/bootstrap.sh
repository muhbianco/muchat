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
  installer=""
  if [[ -f "$STOAT_DIR/brand/public/download/Muchat-Setup.exe" ]]; then
    installer="$(mktemp)"
    cp -a "$STOAT_DIR/brand/public/download/Muchat-Setup.exe" "$installer"
  fi
  cp -a "$MUCHAT_DIR/Caddyfile" "$STOAT_DIR/Caddyfile"
  cp -a "$MUCHAT_DIR/compose.override.yml" "$STOAT_DIR/compose.override.yml"
  rm -rf "$STOAT_DIR/brand" "$STOAT_DIR/invite"
  cp -a "$MUCHAT_DIR/brand" "$STOAT_DIR/brand"
  cp -a "$MUCHAT_DIR/invite" "$STOAT_DIR/invite"
  if [[ -n "$installer" ]]; then
    mkdir -p "$STOAT_DIR/brand/public/download"
    mv "$installer" "$STOAT_DIR/brand/public/download/Muchat-Setup.exe"
  fi
}

copy_overlay
cd "$STOAT_DIR"

if [[ ! -f Revolt.toml ]]; then
  printf 'y\nY\n' | ./generate_config.sh "$DOMAIN"
  copy_overlay
fi

if ! grep -q '^MUCHAT_INVITE_SECRET=' .env 2>/dev/null; then
  printf 'MUCHAT_INVITE_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi
if ! grep -q '^PUBLIC_URL=' .env 2>/dev/null; then
  printf 'PUBLIC_URL=https://%s\n' "$DOMAIN" >> .env
fi

python3 - <<'PY'
import re
from pathlib import Path

p = Path("Revolt.toml")
text = p.read_text(encoding="utf-8")
text = text.replace("voice_quality = 16000", "voice_quality = 48000")
text = text.replace("video_resolution = [1080, 720]", "video_resolution = [1920, 1080]")
text = text.replace("video_resolution = [1280, 720]", "video_resolution = [1920, 1080]")
text = text.replace("attachments = 20_000_000", "attachments = 50_000_000")
text = text.replace("body_limit_size = 20_000_000", "body_limit_size = 55_000_000")
if "[api.registration]" not in text:
    text += "\n[api.registration]\ninvite_only = true\n"
elif re.search(r"^invite_only\s*=", text, flags=re.M):
    text = re.sub(r"^invite_only\s*=\s*(true|false)\s*$", "invite_only = true", text, flags=re.M)
else:
    text = text.replace("[api.registration]", "[api.registration]\ninvite_only = true", 1)
if "restrict_server_creation" not in text:
    text += "\n[features.limits.global]\nrestrict_server_creation = []\n"
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

WEB_IMAGE="muchat-web:latest"
if ! command -v docker >/dev/null || ! docker image inspect "${WEB_IMAGE}" >/dev/null 2>&1; then
  WEB_IMAGE="$(awk '/for-web/ {print $2; exit}' compose.yml || true)"
fi
if [[ -n "${WEB_IMAGE}" ]] && command -v docker >/dev/null && docker image inspect "${WEB_IMAGE}" >/dev/null 2>&1; then
  tmp="$(mktemp)"
  if docker run --rm --entrypoint cat "${WEB_IMAGE}" /app/dist_injected/index.html > "${tmp}" 2>/dev/null \
    || docker run --rm --entrypoint cat "${WEB_IMAGE}" /app/dist/index.html > "${tmp}" 2>/dev/null; then
    python3 "$MUCHAT_DIR/brand/patch_index.py" "${tmp}" "$STOAT_DIR/brand/generated-index.html"
  fi
  rm -f "${tmp}"
fi

echo "overlay pronto em $STOAT_DIR"
