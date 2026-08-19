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
  assert.equal(mapped[0].thumbnail, undefined);
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
  assert.ok(pkg.build.files.includes("update.js"));
  assert.match(pkg.build.nsis.artifactName, /\$\{version\}/);
  assert.equal(pkg.build.nsis.include, "installer.nsh");
  assert.equal(pkg.version, "1.0.16");
  assert.equal(pkg.dependencies["electron-updater"], "6.6.2");
  assert.equal(pkg.build.publish.provider, "generic");
  assert.match(pkg.build.publish.url, /chat\.muhbianco\.com\.br\/download/);
});

test("splash na mesma janela com barra de progresso, sem tela preta ao mostrar", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  const splash = fs.readFileSync(path.join(__dirname, "splash.html"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");
  assert.match(main, /disableHardwareAcceleration/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /Muchat \$\{version\}/);
  assert.match(main, /splashReady/);
  assert.match(main, /splash.html/);
  assert.match(main, /setProgressBar\(-1,\s*\{\s*mode:\s*"none"/);
  assert.match(main, /did-stop-loading/);
  assert.match(main, /Atualizando\|Instalando/);
  assert.match(main, /show:\s*true/);
  assert.match(main, /webContents\.invalidate/);
  assert.doesNotMatch(main, /splashWindow/);
  assert.match(main, /maybeInstallUpdate/);
  assert.match(main, /Verificando atualização/);
  assert.match(splash, /Carregando/);
  assert.match(splash, /muchat-load/);
  assert.match(splash, /onLoadProgress/);
  assert.match(preload, /onLoadProgress/);
  assert.match(preload, /payload\.label/);
  assert.match(fs.readFileSync(path.join(__dirname, "installer.nsh"), "utf8"), /taskkill \/F \/IM Muchat\.exe/);
});

test("picker de tela arma a fonte antes do getDisplayMedia", () => {
  const capture = fs.readFileSync(path.join(__dirname, "capture.js"), "utf8");
  const map = fs.readFileSync(path.join(__dirname, "capture-map.js"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");
  const main = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  assert.match(capture, /useSystemPicker:\s*false/);
  assert.doesNotMatch(capture, /Menu\.buildFromTemplate/);
  assert.match(capture, /listScreenSources/);
  assert.match(capture, /armScreenShare/);
  assert.match(capture, /grantVideo/);
  assert.doesNotMatch(capture, /loopback/);
  assert.match(main, /WebRtcAllowWgcScreenCapturer/);
  assert.doesNotMatch(map, /toDataURL/);
  assert.match(preload, /listScreenSources/);
  assert.match(preload, /armScreenShare/);
  assert.match(main, /permission === "display-capture"/);
});
