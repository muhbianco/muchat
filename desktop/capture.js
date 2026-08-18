"use strict";

const { desktopCapturer, ipcMain, session, Menu } = require("electron");

function pickDesktopSource(sources, request, win, callback) {
  let settled = false;
  const done = (result) => {
    if (settled) return;
    settled = true;
    callback(result);
  };

  const items = sources.map((source) => ({
    label: String(source.name || "Fonte").slice(0, 80),
    click: () => {
      done(
        request.audioRequested
          ? { video: source, audio: "loopback" }
          : { video: source }
      );
    },
  }));
  items.push({ type: "separator" });
  items.push({ label: "Cancelar", click: () => done({}) });

  const menu = Menu.buildFromTemplate(items);
  const opts = { callback: () => done({}) };
  if (win && !win.isDestroyed()) opts.window = win;
  menu.popup(opts);
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
            callback({});
            return;
          }
          pickDesktopSource(sources, request, getWindow(), callback);
        })
        .catch(() => callback({}));
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
