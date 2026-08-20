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
  assert.doesNotMatch(src, /Atualizando/);
});
