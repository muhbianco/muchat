"use strict";

const { app, BrowserWindow, Menu, Tray, session, shell, systemPreferences } = require("electron");
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
      sandbox: false,
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
  const allow = (wc, permission, origin) => {
    if (isAllowedPermission(permission, origin)) return true;
    try {
      return isAppOrigin(wc.getURL()) && isAllowedPermission(permission, APP_ORIGIN);
    } catch {
      return false;
    }
  };
  sess.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allow(wc, permission, details?.requestingUrl || details?.securityOrigin));
  });
  sess.setPermissionCheckHandler((wc, permission, requestingOrigin) =>
    allow(wc, permission, requestingOrigin)
  );
  if (typeof sess.setDevicePermissionHandler === "function") {
    sess.setDevicePermissionHandler((details) => {
      if (!isAppOrigin(details.origin)) return false;
      return (
        details.deviceType === "audioinput" ||
        details.deviceType === "audiooutput" ||
        details.deviceType === "videoinput"
      );
    });
  }
}

async function askOsMediaAccess() {
  if (typeof systemPreferences.askForMediaAccess !== "function") return;
  try {
    await systemPreferences.askForMediaAccess("microphone");
    await systemPreferences.askForMediaAccess("camera");
  } catch {
    /* Windows does not implement this */
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    grantAppPermissions();
    await askOsMediaAccess();
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
