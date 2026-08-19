"use strict";

const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

const FEED_URL = "https://chat.muhbianco.com.br/download/";
const CHECK_MS = 12000;
const DOWNLOAD_MS = 180000;

function maybeInstallUpdate(onProgress, onWillQuit) {
  if (!app.isPackaged) return Promise.resolve("skip");

  return new Promise((resolve) => {
    let settled = false;
    let timer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      autoUpdater.removeAllListeners("update-not-available");
      autoUpdater.removeAllListeners("update-available");
      autoUpdater.removeAllListeners("download-progress");
      autoUpdater.removeAllListeners("update-downloaded");
      autoUpdater.removeAllListeners("error");
      resolve(result);
    };

    timer = setTimeout(() => finish("skip"), CHECK_MS);

    try {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.allowDowngrade = false;
      autoUpdater.disableDifferentialDownload = true;
      autoUpdater.verifyUpdateCodeSignature = false;
      autoUpdater.setFeedURL({ provider: "generic", url: FEED_URL });
    } catch {
      finish("skip");
      return;
    }

    autoUpdater.once("update-not-available", () => finish("skip"));
    autoUpdater.once("update-available", () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish("skip"), DOWNLOAD_MS);
      onProgress(18, "Atualizando…");
    });
    autoUpdater.on("download-progress", (progress) => {
      const pct = 18 + Math.max(0, Math.min(100, Number(progress.percent) || 0)) * 0.72;
      onProgress(pct, "Atualizando…");
    });
    autoUpdater.once("update-downloaded", () => {
      onProgress(96, "Instalando…");
      try {
        if (typeof onWillQuit === "function") onWillQuit();
        autoUpdater.quitAndInstall(true, true);
        finish("relaunch");
      } catch {
        finish("skip");
      }
    });
    autoUpdater.once("error", () => finish("skip"));

    autoUpdater.checkForUpdates().catch(() => finish("skip"));
  });
}

module.exports = { maybeInstallUpdate, FEED_URL };
