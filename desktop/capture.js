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

function setupScreenShare(getWindow) {
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({
          types: ["screen", "window"],
          thumbnailSize: { width: 0, height: 0 },
          fetchWindowIcons: true,
        })
        .then((sources) => {
          if (!sources.length) {
            denyDisplayMedia(callback);
            return;
          }
          const win = getWindow();
          if (!win || win.isDestroyed()) {
            denyDisplayMedia(callback);
            return;
          }
          let settled = false;
          const done = (result) => {
            if (settled) return;
            settled = true;
            if (result && result.video) {
              callback(result);
              return;
            }
            denyDisplayMedia(callback);
          };
          ipcMain.removeAllListeners("screenPickerCallback");
          ipcMain.once("screenPickerCallback", (_event, idx, audio) => {
            if (!Number.isInteger(idx) || idx < 0 || idx >= sources.length) {
              done({});
              return;
            }
            if (audio || request.audioRequested) {
              done({ video: sources[idx], audio: "loopback" });
              return;
            }
            done({ video: sources[idx] });
          });
          setTimeout(() => done({}), 60000);
          try {
            win.webContents.send("screenPicker", mapSources(sources));
          } catch {
            done({});
          }
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
