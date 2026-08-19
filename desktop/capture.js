"use strict";

const { desktopCapturer, ipcMain, session } = require("electron");
const { mapSources } = require("./capture-map");

let lastSources = [];
let armedSource = null;

function denyDisplayMedia(callback) {
  try {
    callback({});
  } catch {
    /* Electron throws if video was requested and we deny with {} */
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label || "capturer-timeout")), ms);
    }),
  ]);
}

function sourceOpts(types) {
  return {
    types,
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: false,
  };
}

async function getShareSources() {
  const screens = await withTimeout(
    desktopCapturer.getSources(sourceOpts(["screen"])),
    3000,
    "capturer-timeout"
  );
  let windows = [];
  try {
    windows = await withTimeout(
      desktopCapturer.getSources(sourceOpts(["window"])),
      3000,
      "capturer-timeout"
    );
  } catch {
    windows = [];
  }
  return [...screens, ...windows];
}

function grantVideo(source, callback) {
  if (!source) {
    denyDisplayMedia(callback);
    return;
  }
  try {
    callback({ video: source });
  } catch {
    denyDisplayMedia(callback);
  }
}

function setupScreenShare(getWindow) {
  ipcMain.removeHandler("listScreenSources");
  ipcMain.removeHandler("armScreenShare");
  ipcMain.handle("listScreenSources", async () => {
    const sources = await getShareSources();
    lastSources = sources;
    return mapSources(sources);
  });
  ipcMain.handle("armScreenShare", (_event, idx) => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= lastSources.length) {
      armedSource = null;
      return false;
    }
    armedSource = lastSources[idx];
    return true;
  });

  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      const held = armedSource;
      armedSource = null;
      if (!held) {
        denyDisplayMedia(callback);
        return;
      }
      const types = String(held.id || "").startsWith("screen")
        ? ["screen"]
        : ["window"];
      withTimeout(desktopCapturer.getSources(sourceOpts(types)), 2500, "capturer-timeout")
        .then((sources) => {
          grantVideo(
            sources.find((item) => item.id === held.id) || held,
            callback
          );
        })
        .catch(() => grantVideo(held, callback));
    },
    { useSystemPicker: false }
  );

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

module.exports = { setupScreenShare };
