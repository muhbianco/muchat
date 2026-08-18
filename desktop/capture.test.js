"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { mapSources } = require("./capture-map");

test("mapeia fontes do desktopCapturer para o picker do Stoat", () => {
  const mapped = mapSources([
    { id: "screen:0:0", name: "Tela 1", appIcon: null },
    { id: "window:1:0", name: "Jogo", appIcon: null },
  ]);
  assert.equal(mapped[0].isFullScreen, true);
  assert.equal(mapped[1].isFullScreen, false);
  assert.equal(mapped[1].idx, 1);
  assert.equal(mapped[1].name, "Jogo");
});

test("o pacote inclui preload e captura de tela", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  assert.ok(pkg.build.files.includes("preload.js"));
  assert.ok(pkg.build.files.includes("capture.js"));
  assert.ok(pkg.build.files.includes("capture-map.js"));
});
