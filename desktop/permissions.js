"use strict";

const PROD_ORIGIN = "https://chat.muhbianco.com.br";
const APP_ID = "br.com.muhbianco.muchat";

/**
 * Normalise an origin override, e.g. MUCHAT_ORIGIN=http://localhost:5173.
 * Returns "" when the value is missing or not a usable origin.
 */
function normaliseOrigin(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    // "localhost:5173" parses as the scheme "localhost:", whose origin is the
    // literal string "null"; only http(s) yields a usable origin.
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

const DEV_ORIGIN = normaliseOrigin(process.env.MUCHAT_ORIGIN);
const APP_ORIGIN = DEV_ORIGIN || PROD_ORIGIN;
const IS_DEV_ORIGIN = APP_ORIGIN !== PROD_ORIGIN;

const ALLOWED_PERMISSIONS = new Set([
  "notifications",
  "media",
  "mediaKeySystem",
  "audioCapture",
  "videoCapture",
  "camera",
  "microphone",
  "fullscreen",
  "display-capture",
  "clipboard-sanitized-write",
  "clipboard-read",
]);

function isAppOrigin(url) {
  if (!url || typeof url !== "string") return false;
  if (url === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`)) return true;
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function isAllowedPermission(permission, requestingOrigin) {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;
  if (!requestingOrigin) return true;
  return isAppOrigin(requestingOrigin);
}

module.exports = {
  APP_ID,
  APP_ORIGIN,
  PROD_ORIGIN,
  IS_DEV_ORIGIN,
  ALLOWED_PERMISSIONS,
  normaliseOrigin,
  isAppOrigin,
  isAllowedPermission,
};
