#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-chat.muhbianco.com.br}"
STOAT_DIR="${STOAT_DIR:-/usr/src/stoat}"
MUCHAT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

command -v rsync >/dev/null || { echo "rsync is required to copy the overlay without breaking Caddy bind mounts"; exit 1; }

mkdir -p "$STOAT_DIR"
if [[ ! -f "$STOAT_DIR/compose.yml" ]]; then
  git clone --depth 1 https://github.com/stoatchat/self-hosted.git "$STOAT_DIR"
fi

# brand/public is bind-mounted into Caddy. Replacing that inode (rm -rf brand)
# leaves the container serving an empty deleted directory until Caddy is recreated.
copy_overlay() {
  cp -a "$MUCHAT_DIR/Caddyfile" "$STOAT_DIR/Caddyfile"
  cp -a "$MUCHAT_DIR/compose.override.yml" "$STOAT_DIR/compose.override.yml"
  mkdir -p "$STOAT_DIR/brand/public/download"
  rsync -a --delete \
    --exclude 'public/download/*.exe' \
    --exclude 'public/download/*.apk' \
    --exclude 'public/download/*.yml' \
    --exclude 'public/download/*.blockmap' \
    "$MUCHAT_DIR/brand/" "$STOAT_DIR/brand/"
  rm -rf "$STOAT_DIR/invite" "$STOAT_DIR/invite-bot"
  cp -a "$MUCHAT_DIR/invite" "$STOAT_DIR/invite"
  cp -a "$MUCHAT_DIR/invite-bot" "$STOAT_DIR/invite-bot"
}

heal_caddy_bind() {
  local host_ino container_ino
  host_ino="$(stat -c '%i' "$STOAT_DIR/brand/public" 2>/dev/null || true)"
  container_ino="$(docker exec stoat-caddy-1 stat -c '%i' /muchat-public 2>/dev/null || true)"
  if [[ -n "$host_ino" && -n "$container_ino" && "$host_ino" != "$container_ino" ]]; then
    echo "caddy bind mount stale ($container_ino != $host_ino); recreating"
    docker compose -p stoat up -d --force-recreate --no-deps caddy
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
for key in STOAT_BOT_TOKEN MUHBIANCO_API_KEY MUCHAT_INVITE_EMAIL_WEBHOOK_URL MUCHAT_INVITE_EMAIL_WEBHOOK_SECRET; do
  if ! grep -q "^${key}=" .env 2>/dev/null; then
    printf '%s=\n' "$key" >> .env
  fi
done

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

heal_caddy_bind
echo "overlay pronto em $STOAT_DIR"
