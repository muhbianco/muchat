"use strict";

/** Windows 11 starts at this NT build. `roundedCorners` is a no-op before it. */
const WIN11_BUILD = 22000;
/** CSS corner radius used on Windows 10, where DWM will not round the HWND. */
const CSS_RADIUS_PX = 8;
const DEFAULT_BG = "#141210";
const TRANSPARENT_BG = "#00000000";
const HEX6 = /^#([0-9a-fA-F]{6})$/;

/** NT build from `os.release()`, e.g. "10.0.19045" → 19045. */
function windowsBuild(release) {
  const parts = String(release || "").split(".");
  return Number(parts[2]) || 0;
}

function isWindows11(release, platform = "win32") {
  return platform === "win32" && windowsBuild(release) >= WIN11_BUILD;
}

/** `native` = DWM corners (Win11). `css` = transparent HWND + CSS radius (Win10). */
function roundMode(release, platform = "win32") {
  if (platform !== "win32") return "none";
  return isWindows11(release, platform) ? "native" : "css";
}

function hasCustomFrame(platform = "win32") {
  return platform === "win32";
}

/**
 * Extra argv flags for the sandboxed preload (it cannot require this file).
 * Version stays in main.js so existing preload tests keep matching it there.
 */
function chromeArgvFlags(platform, release) {
  if (platform !== "win32") return [];
  return [
    "--muchat-frame=custom",
    `--muchat-round=${roundMode(release, platform)}`,
  ];
}

function windowChromeOptions({
  platform = "win32",
  release = "",
  backgroundColor = DEFAULT_BG,
} = {}) {
  if (platform !== "win32") {
    return {
      frame: true,
      autoHideMenuBar: true,
      backgroundColor,
    };
  }

  const round = roundMode(release, platform);
  if (round === "native") {
    return {
      frame: false,
      autoHideMenuBar: true,
      roundedCorners: true,
      transparent: false,
      backgroundColor,
    };
  }

  return {
    frame: false,
    autoHideMenuBar: true,
    roundedCorners: false,
    transparent: true,
    backgroundColor: TRANSPARENT_BG,
  };
}

function sanitiseWindowBackground(color) {
  if (typeof color !== "string") return "";
  const trimmed = color.trim();
  return HEX6.test(trimmed) ? trimmed : "";
}

/**
 * Win10 transparent windows must stay fully transparent while restored,
 * otherwise the HWND paints a square behind the CSS radius.
 */
function windowBackgroundForState(color, round, maximised) {
  if (round === "css" && !maximised) return TRANSPARENT_BG;
  return sanitiseWindowBackground(color) || DEFAULT_BG;
}

/** F5 / Ctrl+F5 / Ctrl+R / Ctrl+Shift+R (and the meta equivalents). */
function isReloadKey(input) {
  if (!input || input.type === "keyUp" || input.type === "char") return false;
  const key = String(input.key || "").toLowerCase();
  if (key === "f5") return true;
  const modifier = Boolean(input.control || input.meta);
  return modifier && key === "r";
}

module.exports = {
  WIN11_BUILD,
  CSS_RADIUS_PX,
  DEFAULT_BG,
  TRANSPARENT_BG,
  isWindows11,
  roundMode,
  hasCustomFrame,
  chromeArgvFlags,
  windowChromeOptions,
  sanitiseWindowBackground,
  windowBackgroundForState,
  isReloadKey,
};
