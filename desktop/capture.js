"use strict";

const { desktopCapturer, ipcMain, session } = require("electron");
const { mapSources } = require("./capture-map");

function setupScreenShare(getWindow) {
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen", "window"], fetchWindowIcons: true })
        .then((sources) => {
          if (!sources.length) {
            callback({});
            return;
          }
          if (sources.length === 1) {
            callback(
              request.audioRequested
                ? { video: sources[0], audio: "loopback" }
                : { video: sources[0] }
            );
            return;
          }
          const win = getWindow();
          if (!win || win.isDestroyed()) {
            callback({ video: sources[0] });
            return;
          }
          ipcMain.once("screenPickerCallback", (_event, idx, audio) => {
            if (!Number.isInteger(idx) || idx < 0 || idx >= sources.length) {
              callback({});
              return;
            }
            if (audio || request.audioRequested) {
              callback({ video: sources[idx], audio: "loopback" });
              return;
            }
            callback({ video: sources[idx] });
          });
          win.webContents.send("screenPicker", mapSources(sources));
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: true }
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
