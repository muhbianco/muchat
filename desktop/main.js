"use strict";

const { app, BrowserWindow, Menu, Tray, session, shell, ipcMain } = require("electron");
const os = require("os");
const path = require("path");
const { version } = require("./package.json");
const { setupScreenShare } = require("./capture");
const { setupAutoUpdate } = require("./update");
const {
  APP_ID,
  APP_ORIGIN,
  IS_DEV_ORIGIN,
  isAppOrigin,
  isAllowedPermission,
} = require("./permissions");
const { shouldHideToTray } = require("./lifecycle");
const { shouldDisableWgcCapturer } = require("./wgc");
const {
  DEFAULT_BG,
  chromeArgvFlags,
  isReloadKey,
  roundMode,
  sanitiseWindowBackground,
  windowBackgroundForState,
  windowChromeOptions,
} = require("./chrome");

app.setName("Muchat");
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
  app.disableHardwareAcceleration();
}
const disabledFeatures = ["ServiceWorker"];
if (shouldDisableWgcCapturer()) {
  disabledFeatures.push(
    "WebRtcAllowWgcScreenCapturer",
    "WebRtcAllowWgcWindowCapturer"
  );
}
app.commandLine.appendSwitch("disable-features", disabledFeatures.join(","));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let mainWindow = null;
let tray = null;
let isQuitting = false;
let loadPhase = "splash";
let appUpdater = null;
const CHROME_ROUND = roundMode(os.release(), process.platform);
let lastWindowBg = DEFAULT_BG;

function iconPath() {
  return path.join(__dirname, "icon.ico");
}

function paintVisibleWindow(win) {
  if (!win || win.isDestroyed()) return;
  win.setSkipTaskbar(false);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (process.platform !== "win32") return;
  try {
    const [width, height] = win.getSize();
    win.setSize(width, height + 1);
    win.setSize(width, height);
    win.webContents.invalidate();
  } catch {
    /* ignore */
  }
}

function setLoadProgress(pct, label) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  if (/Atualizando|Instalando/.test(String(label || ""))) {
    mainWindow.setProgressBar(clamped / 100);
  }
  try {
    mainWindow.webContents.send("loadProgress", {
      pct: Math.round(clamped),
      label: label || "",
    });
  } catch {
    /* splash page may not have a listener yet */
  }
}

function clearLoadProgress() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.setProgressBar(-1, { mode: "none" });
  } catch {
    mainWindow.setProgressBar(-1);
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  paintVisibleWindow(mainWindow);
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  mainWindow.setSkipTaskbar(true);
}

function sendWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send("windowState", { maximised: win.isMaximized() });
  } catch {
    /* splash / chat may not have a listener yet */
  }
}

function applyWindowBackground(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setBackgroundColor(
      windowBackgroundForState(lastWindowBg, CHROME_ROUND, win.isMaximized()),
    );
  } catch {
    /* ignore */
  }
}

async function loadChat(win) {
  loadPhase = "chat";
  setLoadProgress(30, "Carregando…");
  // A dev server already busts its own caches through HMR, and wiping storage on
  // every reload would log the developer out on each restart.
  if (!IS_DEV_ORIGIN) {
    try {
      await win.webContents.session.clearCache();
      await win.webContents.session.clearStorageData({
        origin: APP_ORIGIN,
        storages: ["serviceworkers", "cachestorage"],
      });
    } catch {
      /* keep going even if Chromium cache wipe fails */
    }
  }
  if (win.isDestroyed()) return;
  win.loadURL(`${APP_ORIGIN}/`);
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
  loadPhase = "splash";
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: IS_DEV_ORIGIN ? `Muchat ${version} — dev` : `Muchat ${version}`,
    icon: iconPath(),
    show: true,
    ...windowChromeOptions({
      platform: process.platform,
      release: os.release(),
      backgroundColor: lastWindowBg,
    }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      additionalArguments: [
        `--muchat-version=${version}`,
        ...chromeArgvFlags(process.platform, os.release()),
      ],
    },
  });

  if (!IS_DEV_ORIGIN) {
    win.webContents.on("before-input-event", (event, input) => {
      if (isReloadKey(input)) event.preventDefault();
    });
  }

  win.on("maximize", () => {
    applyWindowBackground(win);
    sendWindowState(win);
  });
  win.on("unmaximize", () => {
    applyWindowBackground(win);
    sendWindowState(win);
  });

  win.loadFile(path.join(__dirname, "splash.html"), { query: { v: version } });
  setLoadProgress(8, "Carregando…");

  win.webContents.on("did-finish-load", () => {
    if (win.isDestroyed()) return;
    if (loadPhase === "splash") {
      loadPhase = "chat";
      loadChat(win);
      return;
    }
    if (loadPhase === "chat") {
      clearLoadProgress();
      paintVisibleWindow(win);
      if (IS_DEV_ORIGIN) win.webContents.openDevTools({ mode: "right" });
      if (appUpdater) appUpdater.check();
    }
  });

  win.webContents.on("did-start-loading", () => {
    if (loadPhase === "chat") setLoadProgress(40, "Carregando…");
  });

  win.webContents.on("dom-ready", () => {
    if (loadPhase === "chat") setLoadProgress(62, "Carregando…");
  });

  win.webContents.on("did-stop-loading", () => {
    if (loadPhase === "chat") clearLoadProgress();
  });

  win.webContents.on("did-fail-load", (_event, code, desc, url, isMainFrame) => {
    if (!isMainFrame || win.isDestroyed() || code === -3) return;
    loadPhase = "error";
    clearLoadProgress();
    paintVisibleWindow(win);
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<!doctype html><title>Muchat ${version}</title>` +
            `<style>html,body{margin:0;height:100%;background:#141210;color:#f3efe6;font-family:system-ui}` +
            `body{display:flex;flex-direction:column}` +
            `.chrome{display:flex;height:29px;align-items:center;background:#1c1a18;-webkit-app-region:drag}` +
            `.chrome span{padding:0 10px;font-size:12px}` +
            `.chrome button{-webkit-app-region:no-drag;width:44px;height:100%;border:0;background:transparent;color:#c9c2b6;cursor:pointer;margin-left:auto}` +
            `.copy{padding:2rem;flex:1}</style>` +
            `<div class="chrome"><span>Muchat</span>` +
            `<button type="button" id="close" aria-label="Fechar">&#x2715;</button></div>` +
            `<div class="copy"><h1>Muchat ${version}</h1><p>Não carregou o chat (${code}).</p>` +
            `<p>${desc}</p><p>${url}</p></div>` +
            `<script>document.getElementById("close").onclick=function(){window.native&&window.native.close()}</script>`
        )
    );
  });

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
    if (permission === "display-capture" || permission === "media") {
      callback(true);
      return;
    }
    callback(isAllowedPermission(permission, details?.requestingUrl || details?.securityOrigin));
  });
  sess.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (permission === "display-capture" || permission === "media") return true;
    return isAllowedPermission(permission, requestingOrigin);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    grantAppPermissions();
    setupScreenShare(() => mainWindow);
    createTray();
    ipcMain.removeHandler("windowState");
    ipcMain.handle("windowState", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return { maximised: false };
      return { maximised: mainWindow.isMaximized() };
    });
    ipcMain.on("setWindowBackground", (_event, color) => {
      const safe = sanitiseWindowBackground(color);
      if (!safe) return;
      lastWindowBg = safe;
      applyWindowBackground(mainWindow);
    });
    createWindow();
    appUpdater = setupAutoUpdate({
      send: (payload) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
          mainWindow.webContents.send("appUpdate", payload);
        } catch {
          /* chat page may not be listening yet */
        }
      },
      onWillQuit: () => {
        isQuitting = true;
      },
    });
    ipcMain.on("installAppUpdate", () => {
      if (appUpdater) appUpdater.install();
    });
    ipcMain.removeHandler("updateState");
    ipcMain.handle("updateState", () =>
      appUpdater ? appUpdater.state() : { state: "idle" },
    );
    ipcMain.on("splashReady", () => {
      setLoadProgress(100);
      clearLoadProgress();
      paintVisibleWindow(mainWindow);
      if (appUpdater) appUpdater.check();
    });
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
