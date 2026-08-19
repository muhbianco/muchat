"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { mapSources } = require("./capture-map");

test("mapeia fontes do desktopCapturer para o picker do Stoat", () => {
  const mapped = mapSources([
    {
      id: "screen:0:0",
      name: "Tela 1",
      appIcon: null,
      thumbnail: { toDataURL: () => "data:image/png,thumb" },
    },
    { id: "window:1:0", name: "Jogo", appIcon: null },
  ]);
  assert.equal(mapped[0].isFullScreen, true);
  assert.equal(mapped[0].thumbnail, "data:image/png,thumb");
  assert.equal(mapped[1].isFullScreen, false);
  assert.equal(mapped[1].idx, 1);
  assert.equal(mapped[1].name, "Jogo");
});

test("o pacote inclui preload e captura de tela", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  assert.ok(pkg.build.files.includes("preload.js"));
  assert.ok(pkg.build.files.includes("capture.js"));
  assert.ok(pkg.build.files.includes("capture-map.js"));
  assert.ok(pkg.build.files.includes("splash.html"));
  assert.match(pkg.build.nsis.artifactName, /\$\{version\}/);
  assert.equal(pkg.build.nsis.include, "installer.nsh");
});

test("pinta a janela sem GPU e mostra a versão no título", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  assert.match(main, /disableHardwareAcceleration/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /Muchat \$\{version\}/);
  assert.match(main, /splashReady/);
  assert.match(main, /splash.html/);
  assert.match(fs.readFileSync(path.join(__dirname, "installer.nsh"), "utf8"), /taskkill \/F \/IM Muchat\.exe/);
});
