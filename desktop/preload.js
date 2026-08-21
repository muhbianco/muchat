"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Sandboxed preloads only get a polyfilled `require` that resolves `electron`,
// `events`, `timers` and `url`. A relative require throws before
// exposeInMainWorld runs and leaves window.native undefined, so the version
// arrives through additionalArguments instead of package.json.
const VERSION_FLAG = "--muchat-version=";
const FRAME_FLAG = "--muchat-frame=custom";
const ROUND_FLAG = "--muchat-round=";

/** Desktop version injected by the main process into the renderer argv. */
function desktopVersion() {
  const flag = process.argv.find((arg) => arg.startsWith(VERSION_FLAG));
  return flag ? flag.slice(VERSION_FLAG.length) : "";
}

/** Custom frame flags; the sandboxed preload cannot require chrome.js. */
function chromeFromArgv() {
  const roundFlag = process.argv.find((arg) => arg.startsWith(ROUND_FLAG));
  return {
    customFrame: process.argv.includes(FRAME_FLAG),
    round: roundFlag ? roundFlag.slice(ROUND_FLAG.length) : "none",
  };
}

const version = desktopVersion();
const chrome = chromeFromArgv();

contextBridge.exposeInMainWorld("native", {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    desktop: () => version,
  },
  minimise: () => ipcRenderer.send("minimise"),
  maximise: () => ipcRenderer.send("maximise"),
  close: () => ipcRenderer.send("close"),
  hasCustomFrame: () => chrome.customFrame,
  usesCssRoundedCorners: () => chrome.round === "css",
  getWindowState: () => ipcRenderer.invoke("windowState"),
  onWindowState: (onState) => {
    ipcRenderer.on("windowState", (_event, payload) => onState(payload));
  },
  setWindowBackground: (color) => ipcRenderer.send("setWindowBackground", color),

  // Screen share is arm-then-capture: the renderer lists sources, shows its own
  // picker, arms the chosen source and only then calls getDisplayMedia, which
  // the main process answers synchronously. Nothing blocks on a pending capture.
  listScreenSources: () => ipcRenderer.invoke("screenSources"),
  armScreenShare: (sourceId, audio) =>
    ipcRenderer.invoke("armScreenShare", sourceId, Boolean(audio)),

  splashReady: () => ipcRenderer.send("splashReady"),
  onLoadProgress: (onProgress) => {
    ipcRenderer.on("loadProgress", (_event, payload) => {
      if (typeof payload === "number") {
        onProgress(payload, "");
        return;
      }
      onProgress(payload && payload.pct, payload && payload.label);
    });
  },
  onAppUpdate: (onUpdate) => {
    ipcRenderer.on("appUpdate", (_event, payload) => onUpdate(payload));
  },
  getUpdateState: () => ipcRenderer.invoke("updateState"),
  installAppUpdate: () => ipcRenderer.send("installAppUpdate"),
  isWayland: () => false,
});
