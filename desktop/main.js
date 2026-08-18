const { app, BrowserWindow, session, shell } = require("electron");
const path = require("path");

const START = "https://chat.muhbianco.com.br/";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#141210",
    title: "Muchat",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.loadURL(START);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://chat.muhbianco.com.br/")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(["media", "notifications", "fullscreen", "clipboard-sanitized-write"].includes(permission));
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
