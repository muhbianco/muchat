"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ResEdit = require("resedit");

test("icon.ico tem vários tamanhos para a taskbar do Windows", () => {
  const icoPath = path.join(__dirname, "icon.ico");
  assert.equal(fs.existsSync(icoPath), true);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
  assert.ok(iconFile.icons.length >= 6);
});
