"use strict";

const { desktopCapturer, ipcMain, session } = require("electron");
const { mapSources } = require("./capture-map");

let lastSources = [];
let armedSource = null;
let pendingDisplay = null;

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

function armIndex(idx) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= lastSources.length) {
    armedSource = null;
    return false;
  }
  armedSource = lastSources[idx];
  return true;
}

function settlePending(idx) {
  if (!pendingDisplay) return;
  const { callback } = pendingDisplay;
  pendingDisplay = null;
  if (!Number.isInteger(idx) || idx < 0 || idx >= lastSources.length) {
    denyDisplayMedia(callback);
    return;
  }
  grantVideo(lastSources[idx], callback);
}

function sendPicker(getWindow, sources) {
  const win = getWindow();
  if (!win || win.isDestroyed()) return false;
  try {
    win.webContents.send("screenPicker", mapSources(sources));
    return true;
  } catch {
    return false;
  }
}

function setupScreenShare(getWindow) {
  ipcMain.removeHandler("listScreenSources");
  ipcMain.removeHandler("armScreenShare");
  ipcMain.removeAllListeners("armScreenShareSync");
  ipcMain.removeAllListeners("screenPickerCallback");
  ipcMain.removeAllListeners("minimise");
  ipcMain.removeAllListeners("maximise");
  ipcMain.removeAllListeners("close");

  ipcMain.handle("listScreenSources", async () => {
    const sources = await getShareSources();
    lastSources = sources;
    return mapSources(sources);
  });
  ipcMain.handle("armScreenShare", (_event, idx) => armIndex(idx));
  ipcMain.on("armScreenShareSync", (event, idx) => {
    event.returnValue = armIndex(idx);
  });
  ipcMain.on("screenPickerCallback", (_event, idx) => {
    settlePending(idx);
  });

  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      const held = armedSource;
      armedSource = null;
      if (held) {
        grantVideo(held, callback);
        return;
      }
      if (pendingDisplay) {
        denyDisplayMedia(pendingDisplay.callback);
        pendingDisplay = null;
      }
      pendingDisplay = { callback };
      getShareSources()
        .then((sources) => {
          if (!pendingDisplay || pendingDisplay.callback !== callback) return;
          lastSources = sources;
          if (sendPicker(getWindow, sources)) return;
          pendingDisplay = null;
          denyDisplayMedia(callback);
        })
        .catch(() => {
          if (!pendingDisplay || pendingDisplay.callback !== callback) return;
          lastSources = [];
          if (sendPicker(getWindow, [])) return;
          pendingDisplay = null;
          denyDisplayMedia(callback);
        });
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
