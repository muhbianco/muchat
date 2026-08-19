"use strict";

const { desktopCapturer, ipcMain, session, Menu } = require("electron");
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
          const pick = (idx) => {
            if (!Number.isInteger(idx) || idx < 0 || idx >= sources.length) {
              done({});
              return;
            }
            if (request.audioRequested) {
              done({ video: sources[idx], audio: "loopback" });
              return;
            }
            done({ video: sources[idx] });
          };
          ipcMain.removeAllListeners("screenPickerCallback");
          ipcMain.once("screenPickerCallback", (_event, idx) => pick(idx));
          try {
            win.webContents.send("screenPicker", mapSources(sources));
          } catch {
            /* overlay is optional */
          }
          const template = sources.map((source, idx) => ({
            label: String(source.name || "Fonte").slice(0, 80),
            click: () => pick(idx),
          }));
          template.push({ type: "separator" });
          template.push({ label: "Cancelar", click: () => done({}) });
          Menu.buildFromTemplate(template).popup({
            window: win,
            callback: () => {
              setTimeout(() => done({}), 50);
            },
          });
        })
        .catch(() => denyDisplayMedia(callback));
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
