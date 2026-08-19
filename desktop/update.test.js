"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("feed de update é o /download do chat, sem tela extra", () => {
  const src = fs.readFileSync(path.join(__dirname, "update.js"), "utf8");
  assert.match(src, /https:\/\/chat\.muhbianco\.com\.br\/download\//);
  assert.match(src, /quitAndInstall\(true,\s*true\)/);
  assert.match(src, /isPackaged/);
  assert.match(src, /disableDifferentialDownload/);
  assert.match(src, /Atualizando/);
  assert.match(src, /onWillQuit/);
});
