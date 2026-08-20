#!/usr/bin/env bash
# Build the Muchat web image from the for-web fork and refresh generated-index.html.
set -euo pipefail

FOR_WEB_DIR="${FOR_WEB_DIR:-/usr/src/for-web}"
STOAT_DIR="${STOAT_DIR:-/usr/src/stoat}"
MUCHAT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${FOR_WEB_REPO:-https://github.com/muhbianco/for-web.git}"

if [[ ! -d "$FOR_WEB_DIR/.git" ]]; then
  git clone --depth 1 "$REPO" "$FOR_WEB_DIR"
fi

cd "$FOR_WEB_DIR"
git pull --ff-only
git submodule update --init packages/stoat.js packages/solid-livekit-components

docker build -t muchat-web:latest "$FOR_WEB_DIR"

tmp="$(mktemp)"
if docker run --rm --entrypoint cat muchat-web:latest /app/dist/index.html > "$tmp"; then
  python3 "$MUCHAT_DIR/brand/patch_index.py" "$tmp" "$STOAT_DIR/brand/generated-index.html"
  cp -a "$STOAT_DIR/brand/generated-index.html" "$MUCHAT_DIR/brand/generated-index.html"
fi
rm -f "$tmp"

echo "muchat-web:latest pronto"
