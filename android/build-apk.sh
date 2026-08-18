#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
KEYDIR="${MUCHAT_ANDROID_KEYDIR:-/root/muchat-android}"
OUT_DIR="${1:-}"
VERSION="$(grep -m1 'versionName' "$ROOT/app/build.gradle" | sed 's/.*"\(.*\)".*/\1/')"

mkdir -p "$KEYDIR"
if [[ ! -f "$KEYDIR/release.jks" ]]; then
  STOREPASS="$(openssl rand -hex 16)"
  docker run --rm -v "$KEYDIR:/keys" eclipse-temurin:17-jdk-jammy \
    keytool -genkeypair -keystore /keys/release.jks -alias muchat \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$STOREPASS" -keypass "$STOREPASS" \
    -dname "CN=Muchat, O=MuhBianco, C=BR"
  umask 077
  cat > "$KEYDIR/keystore.properties" <<EOF
storeFile=release.jks
storePassword=$STOREPASS
keyAlias=muchat
keyPassword=$STOREPASS
EOF
fi

cp -f "$KEYDIR/release.jks" "$ROOT/release.jks"
cp -f "$KEYDIR/keystore.properties" "$ROOT/keystore.properties"

docker build -t muchat-android-sdk:35 "$ROOT"
docker run --rm \
  -v "$ROOT:/src" \
  -w /src \
  muchat-android-sdk:35 \
  gradle assembleRelease --no-daemon

APK="$ROOT/app/build/outputs/apk/release/app-release.apk"
test -f "$APK"
if [[ -n "$OUT_DIR" ]]; then
  mkdir -p "$OUT_DIR"
  cp -f "$APK" "$OUT_DIR/Muchat-$VERSION.apk"
  cp -f "$APK" "$OUT_DIR/Muchat.apk"
  echo "$OUT_DIR/Muchat-$VERSION.apk"
else
  echo "$APK"
fi
