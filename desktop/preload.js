"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const { version } = require("./package.json");

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
    ipcRenderer.removeAllListeners("screenPicker");
    ipcRenderer.once("screenPicker", (_event, sources) => onScreenPick(sources));
  },
  screenPickerCallback: (idx, audio) => {
    ipcRenderer.send("screenPickerCallback", idx, Boolean(audio));
  },
  isWayland: () => false,
});
