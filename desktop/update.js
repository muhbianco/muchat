"use strict";

const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

const FEED_URL = "https://chat.muhbianco.com.br/download/";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function setupAutoUpdate({ send, onWillQuit }) {
  let downloaded = false;
  let latestVersion = "";
  let checking = false;
  let installing = false;

  function emit(state, extra) {
    send({
      state,
      version: latestVersion,
      ...(extra || {}),
    });
  }

  function configure() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.verifyUpdateCodeSignature = false;
    autoUpdater.setFeedURL({ provider: "generic", url: FEED_URL });
  }

  function check() {
    if (!app.isPackaged || checking || installing) return;
    checking = true;
    autoUpdater.checkForUpdates().finally(() => {
      checking = false;
    });
  }

  async function install() {
    if (!app.isPackaged || installing) return;
    if (downloaded) {
      installing = true;
      if (typeof onWillQuit === "function") onWillQuit();
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch {
        installing = false;
        emit("error");
      }
      return;
    }
    installing = true;
    try {
      emit("downloading", { percent: 0 });
      await autoUpdater.downloadUpdate();
    } catch {
      emit("error");
    } finally {
      installing = false;
    }
  }

  if (!app.isPackaged) {
    return { check() {}, install() {} };
  }

  try {
    configure();
  } catch {
    return { check() {}, install() {} };
  }

  autoUpdater.on("update-available", (info) => {
    latestVersion = (info && info.version) || latestVersion;
    emit("available");
  });
  autoUpdater.on("update-not-available", () => {
    downloaded = false;
    emit("none");
  });
  autoUpdater.on("download-progress", (progress) => {
    emit("downloading", {
      percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    downloaded = true;
    latestVersion = (info && info.version) || latestVersion;
    emit("ready");
  });
  autoUpdater.on("error", () => emit("error"));

  setInterval(() => check(), CHECK_EVERY_MS);

  return { check, install };
}

module.exports = { setupAutoUpdate, FEED_URL };
