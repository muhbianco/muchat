#!/usr/bin/env bash
# Build the Muchat web image from the for-web fork.
# Branding and desktop integration live in the fork, so there is nothing to
# inject into index.html afterwards.
set -euo pipefail

FOR_WEB_DIR="${FOR_WEB_DIR:-/usr/src/for-web}"
REPO="${FOR_WEB_REPO:-https://github.com/muhbianco/for-web.git}"

if [[ ! -d "$FOR_WEB_DIR/.git" ]]; then
  git clone --depth 1 "$REPO" "$FOR_WEB_DIR"
fi

cd "$FOR_WEB_DIR"
git pull --ff-only
git submodule update --init packages/stoat.js packages/solid-livekit-components

docker build -t muchat-web:latest "$FOR_WEB_DIR"

echo "muchat-web:latest pronto"
