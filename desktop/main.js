"use strict";

const { app, BrowserWindow, session, shell } = require("electron");
const path = require("path");
const { APP_ID, APP_ORIGIN, isAppOrigin, isAllowedPermission } = require("./permissions");

app.setName("Muchat");
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#141210",
    title: "Muchat",
    icon: path.join(__dirname, "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
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

app.whenReady().then(() => {
  grantAppPermissions();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
