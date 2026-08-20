"use strict";

const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

const FEED_URL = "https://chat.muhbianco.com.br/download/";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const IDLE = { state: "idle" };

function setupAutoUpdate({ send, onWillQuit }) {
  let downloaded = false;
  let latestVersion = "";
  let checking = false;
  let installing = false;
  // The renderer subscribes only once the SPA has mounted, which can happen
  // after the first check already fired. Keeping the last payload lets a late
  // subscriber ask for the current state instead of missing the event.
  let lastPayload = IDLE;

  function emit(state, extra) {
    lastPayload = {
      state,
      version: latestVersion,
      ...(extra || {}),
    };
    send(lastPayload);
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

  /** Current update state, for renderers that subscribed after the fact. */
  function state() {
    return lastPayload;
  }

  if (!app.isPackaged) {
    return { check() {}, install() {}, state: () => IDLE };
  }

  try {
    configure();
  } catch {
    return { check() {}, install() {}, state: () => IDLE };
  }

  autoUpdater.on("update-available", (info) => {
    latestVersion = (info && info.version) || latestVersion;
    emit("available");
  });
  autoUpdater.on("update-not-available", () => {
    downloaded = false;
    emit("idle");
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

  return { check, install, state };
}

module.exports = { setupAutoUpdate, FEED_URL };
