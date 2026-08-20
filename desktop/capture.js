"use strict";

const { desktopCapturer, ipcMain, session } = require("electron");
const { mapSources } = require("./capture-map");

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

function grantVideo(source, callback, audio) {
  if (!source) {
    denyDisplayMedia(callback);
    return;
  }
  try {
    callback(audio ? { video: source, audio: "loopback" } : { video: source });
  } catch {
    denyDisplayMedia(callback);
  }
}

function setupScreenShare(getWindow) {
  ipcMain.removeAllListeners("screenPickerCallback");
  ipcMain.removeAllListeners("minimise");
  ipcMain.removeAllListeners("maximise");
  ipcMain.removeAllListeners("close");

  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      getShareSources()
        .then((sources) => {
          const win = getWindow();
          if (!win || win.isDestroyed()) {
            denyDisplayMedia(callback);
            return;
          }
          ipcMain.removeAllListeners("screenPickerCallback");
          ipcMain.once("screenPickerCallback", (_event, idx, audio) => {
            if (!Number.isInteger(idx) || idx < 0 || idx >= sources.length) {
              denyDisplayMedia(callback);
              return;
            }
            grantVideo(
              sources[idx],
              callback,
              Boolean(audio) && Boolean(request.audioRequested)
            );
          });
          win.webContents.send("screenPicker", mapSources(sources));
        })
        .catch(() => denyDisplayMedia(callback));
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
