"use strict";

const { desktopCapturer, ipcMain, session } = require("electron");
const { mapSources } = require("./capture-map");

// How long an armed source stays valid. The renderer arms a source and calls
// getDisplayMedia in the same click, so this only guards against a request that
// never arrives (e.g. the user cancelled between arming and capturing).
const ARM_TTL_MS = 30000;
const SOURCES_TIMEOUT_MS = 8000;
const THUMBNAIL_SIZE = { width: 320, height: 180 };

let armed = null;

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label || "capturer-timeout")), ms);
    }),
  ]);
}

function sourceOpts(types) {
  return {
    types,
    thumbnailSize: THUMBNAIL_SIZE,
    fetchWindowIcons: true,
  };
}

/**
 * List shareable screens and windows. Screens are mandatory; a failure to
 * enumerate windows still yields a usable picker.
 */
async function getShareSources() {
  const screens = await withTimeout(
    desktopCapturer.getSources(sourceOpts(["screen"])),
    SOURCES_TIMEOUT_MS,
    "capturer-timeout",
  );
  let windows = [];
  try {
    windows = await withTimeout(
      desktopCapturer.getSources(sourceOpts(["window"])),
      SOURCES_TIMEOUT_MS,
      "capturer-timeout",
    );
  } catch {
    windows = [];
  }
  return [...screens, ...windows];
}

/** Drop the armed selection, either after use or once it goes stale. */
function disarm() {
  armed = null;
}

function armedSource() {
  if (!armed) return null;
  if (Date.now() - armed.at > ARM_TTL_MS) {
    disarm();
    return null;
  }
  return armed;
}

/**
 * Resolve a display media request from the source the renderer already picked.
 * This runs synchronously inside the handler: nothing round-trips to the
 * renderer, so the getDisplayMedia promise can never hang waiting on a picker.
 */
function grantArmed(callback) {
  const pick = armedSource();
  disarm();

  if (!pick) {
    // Electron throws when video was requested and we deny with {}.
    try {
      callback({});
    } catch {
      /* denial is best-effort */
    }
    return;
  }

  try {
    callback(
      pick.audio
        ? { video: pick.source, audio: "loopback" }
        : { video: pick.source },
    );
  } catch {
    try {
      callback({});
    } catch {
      /* denial is best-effort */
    }
  }
}

function setupScreenShare(getWindow) {
  ipcMain.removeHandler("screenSources");
  ipcMain.removeHandler("armScreenShare");
  ipcMain.removeAllListeners("minimise");
  ipcMain.removeAllListeners("maximise");
  ipcMain.removeAllListeners("close");
  disarm();

  ipcMain.handle("screenSources", async () => {
    try {
      return mapSources(await getShareSources());
    } catch {
      return [];
    }
  });

  // Arming resolves the id against a fresh enumeration so a stale renderer list
  // cannot select a window that has since closed.
  ipcMain.handle("armScreenShare", async (_event, sourceId, audio) => {
    disarm();
    if (typeof sourceId !== "string" || !sourceId) return false;

    let sources;
    try {
      sources = await getShareSources();
    } catch {
      return false;
    }

    const source = sources.find((candidate) => candidate.id === sourceId);
    if (!source) return false;

    armed = { source, audio: Boolean(audio), at: Date.now() };
    return true;
  });

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (armed && !request.audioRequested) armed.audio = false;
    grantArmed(callback);
  });

  ipcMain.on("minimise", () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.minimize();
  });
  ipcMain.on("maximise", () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("close", () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.close();
  });
}

module.exports = { setupScreenShare, ARM_TTL_MS };
