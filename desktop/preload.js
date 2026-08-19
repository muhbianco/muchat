"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const { version } = require("./package.json");

let overlayScreenPicker = null;
let appScreenPicker = null;

ipcRenderer.on("screenPicker", (_event, sources) => {
  const handler = overlayScreenPicker || appScreenPicker;
  if (typeof handler === "function") handler(sources);
});

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
  onceScreenPicker: (onScreenPick) => {
    appScreenPicker = onScreenPick;
  },
  onScreenPicker: (onScreenPick) => {
    overlayScreenPicker = onScreenPick;
  },
  screenPickerCallback: (idx, audio) => {
    ipcRenderer.send("screenPickerCallback", idx, Boolean(audio));
  },
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
  isWayland: () => false,
});
