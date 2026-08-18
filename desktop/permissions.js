"use strict";

const APP_ORIGIN = "https://chat.muhbianco.com.br";
const APP_ID = "br.com.muhbianco.muchat";

const ALLOWED_PERMISSIONS = new Set([
  "notifications",
  "media",
  "mediaKeySystem",
  "audioCapture",
  "videoCapture",
  "fullscreen",
  "display-capture",
  "clipboard-sanitized-write",
  "clipboard-read",
]);

function isAppOrigin(url) {
  if (!url || typeof url !== "string") return false;
  return url === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`);
}

function isAllowedPermission(permission, requestingOrigin) {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;
  if (!requestingOrigin) return true;
  return isAppOrigin(requestingOrigin);
}

module.exports = {
  APP_ID,
  APP_ORIGIN,
  ALLOWED_PERMISSIONS,
  isAppOrigin,
  isAllowedPermission,
};
