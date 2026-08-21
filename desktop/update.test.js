"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("feed de update é o /download do chat, sem instalar sozinho no splash", () => {
  const src = fs.readFileSync(path.join(__dirname, "update.js"), "utf8");
  assert.match(src, /https:\/\/chat\.muhbianco\.com\.br\/download\//);
  assert.match(src, /quitAndInstall\(true,\s*true\)/);
  assert.match(src, /isPackaged/);
  assert.match(src, /disableDifferentialDownload/);
  assert.match(src, /autoDownload = false/);
  assert.match(src, /downloadUpdate\(\)/);
  assert.match(src, /update-available/);
  assert.match(src, /onWillQuit/);
  assert.match(src, /await autoUpdater\.downloadUpdate\(\)[\s\S]{0,400}quitAndInstall\(true,\s*true\)/);
  assert.doesNotMatch(src, /Atualizando/);
});

test("o último estado fica guardado para quem assinar depois", () => {
  const src = fs.readFileSync(path.join(__dirname, "update.js"), "utf8");
  const main = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");
  assert.match(src, /lastPayload/);
  assert.match(src, /function state\(\)/);
  assert.match(src, /return \{ check, install, state \}/);
  assert.match(main, /ipcMain\.handle\("updateState"/);
  assert.match(preload, /getUpdateState/);
});
