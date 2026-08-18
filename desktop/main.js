"use strict";

const { app, BrowserWindow, Menu, Tray, session, shell } = require("electron");
const path = require("path");
const { setupScreenShare } = require("./capture");
const { APP_ID, APP_ORIGIN, isAppOrigin, isAllowedPermission } = require("./permissions");
const { shouldHideToTray } = require("./lifecycle");

app.setName("Muchat");
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let mainWindow = null;
let tray = null;
let isQuitting = false;

function iconPath() {
  return path.join(__dirname, "icon.ico");
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  mainWindow.setSkipTaskbar(false);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  mainWindow.setSkipTaskbar(true);
}

function quitMuchat() {
  isQuitting = true;
  app.quit();
}

function createTray() {
  if (tray) return;
  tray = new Tray(iconPath());
  tray.setToolTip("Muchat");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Muchat", click: showMainWindow },
      { type: "separator" },
      { label: "Fechar Muchat", click: quitMuchat },
    ])
  );
  tray.on("click", showMainWindow);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#141210",
    title: "Muchat",
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.loadURL(`${APP_ORIGIN}/`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppOrigin(url)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("close", (event) => {
    if (shouldHideToTray(isQuitting)) {
      event.preventDefault();
      hideToTray();
    }
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  mainWindow = win;
}

function grantAppPermissions() {
  const sess = session.defaultSession;
  sess.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(isAllowedPermission(permission, details?.requestingUrl || details?.securityOrigin));
  });
  sess.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    isAllowedPermission(permission, requestingOrigin)
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    grantAppPermissions();
    setupScreenShare(() => mainWindow);
    createTray();
    createWindow();
    app.on("activate", () => {
      showMainWindow();
    });
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("window-all-closed", () => {
    if (shouldHideToTray(isQuitting)) return;
    if (process.platform !== "darwin") app.quit();
  });
}
