"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { mapSources, toDataUrl, THUMB_LIMIT } = require("./capture-map");
const { shouldDisableWgcCapturer } = require("./wgc");

function image(url, empty) {
  return { toDataURL: () => url, isEmpty: () => Boolean(empty) };
}

test("mapeia fontes do desktopCapturer para o picker próprio", () => {
  const mapped = mapSources([
    {
      id: "screen:0:0",
      name: "Tela 1",
      appIcon: null,
      thumbnail: image("data:image/png;base64,thumb"),
    },
    { id: "window:1:0", name: "Jogo", appIcon: image("data:image/png;base64,ico") },
  ]);
  assert.equal(mapped[0].id, "screen:0:0");
  assert.equal(mapped[0].isFullScreen, true);
  assert.equal(mapped[0].thumbnail, "data:image/png;base64,thumb");
  assert.equal(mapped[1].id, "window:1:0");
  assert.equal(mapped[1].isFullScreen, false);
  assert.equal(mapped[1].name, "Jogo");
  assert.equal(mapped[1].thumbnail, undefined);
  assert.equal(mapped[1].appIcon, "data:image/png;base64,ico");
  // O picker endereça por id, nunca por índice.
  assert.equal("idx" in mapped[0], false);
});

test("descarta thumbnail vazia, gigante ou que explode", () => {
  assert.equal(toDataUrl(null), undefined);
  assert.equal(toDataUrl({}), undefined);
  assert.equal(toDataUrl(image("data:x", true)), undefined);
  assert.equal(toDataUrl(image("")), undefined);
  assert.equal(toDataUrl(image("d".repeat(THUMB_LIMIT + 1))), undefined);
  assert.equal(
    toDataUrl({
      toDataURL() {
        throw new Error("nope");
      },
    }),
    undefined,
  );
});

test("mapSources aguenta entrada vazia e nomes faltando", () => {
  assert.deepEqual(mapSources(undefined), []);
  assert.deepEqual(mapSources(null), []);
  assert.equal(mapSources([{ id: "window:9:0" }])[0].name, "Fonte 1");
});

test("o pacote inclui preload e captura de tela", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  assert.ok(pkg.build.files.includes("preload.js"));
  assert.ok(pkg.build.files.includes("capture.js"));
  assert.ok(pkg.build.files.includes("capture-map.js"));
  assert.ok(pkg.build.files.includes("wgc.js"));
  assert.ok(pkg.build.files.includes("splash.html"));
  assert.ok(pkg.build.files.includes("update.js"));
  // Harness de dev e de teste não vão pro instalador.
  assert.equal(pkg.build.files.includes("dev.js"), false);
  assert.equal(pkg.build.files.includes("preload-smoke.js"), false);
  assert.match(pkg.build.nsis.artifactName, /\$\{version\}/);
  assert.equal(pkg.build.nsis.include, "installer.nsh");
  assert.equal(pkg.dependencies["electron-updater"], "6.6.2");
  assert.equal(pkg.build.publish.provider, "generic");
  assert.match(pkg.build.publish.url, /chat\.muhbianco\.com\.br\/download/);
});

test("splash na mesma janela com barra de progresso, sem tela preta ao mostrar", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  const splash = fs.readFileSync(path.join(__dirname, "splash.html"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");
  assert.match(main, /disableHardwareAcceleration/);
  assert.match(main, /ServiceWorker/);
  assert.match(main, /clearStorageData/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /splashReady/);
  assert.match(main, /splash.html/);
  assert.match(main, /setProgressBar\(-1,\s*\{\s*mode:\s*"none"/);
  assert.match(main, /did-stop-loading/);
  assert.match(main, /Atualizando\|Instalando/);
  assert.match(main, /show:\s*true/);
  assert.match(main, /webContents\.invalidate/);
  assert.doesNotMatch(main, /splashWindow/);
  assert.match(main, /setupAutoUpdate/);
  assert.match(main, /installAppUpdate/);
  assert.match(main, /query:\s*\{\s*v:\s*version/);
  assert.match(splash, /Carregando/);
  assert.match(splash, /id="version"/);
  assert.match(splash, /muchat-load/);
  assert.match(splash, /onLoadProgress/);
  assert.match(preload, /onLoadProgress/);
  assert.match(preload, /onAppUpdate/);
  assert.match(preload, /installAppUpdate/);
  assert.match(preload, /payload\.label/);
  assert.match(fs.readFileSync(path.join(__dirname, "installer.nsh"), "utf8"), /taskkill \/F \/IM Muchat\.exe/);
});

test("WGC fica ligado no desktop local e só desliga em RDP", () => {
  assert.equal(shouldDisableWgcCapturer({ SESSIONNAME: "Console" }, "win32"), false);
  assert.equal(shouldDisableWgcCapturer({}, "win32"), false);
  assert.equal(shouldDisableWgcCapturer({ SESSIONNAME: "RDP-Tcp#5" }, "win32"), true);
  assert.equal(shouldDisableWgcCapturer({ SESSIONNAME: "RDP-Tcp#5" }, "linux"), false);
  const main = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  assert.match(main, /shouldDisableWgcCapturer/);
  assert.match(main, /WebRtcAllowWgcScreenCapturer/);
});

test("captura é arm-then-capture, sem esperar o picker dentro do handler", () => {
  const capture = fs.readFileSync(path.join(__dirname, "capture.js"), "utf8");
  const map = fs.readFileSync(path.join(__dirname, "capture-map.js"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");
  const main = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");

  // O handler resolve na hora com a fonte já armada.
  assert.match(capture, /ipcMain\.handle\("screenSources"/);
  assert.match(capture, /ipcMain\.handle\("armScreenShare"/);
  assert.match(capture, /setDisplayMediaRequestHandler/);
  assert.match(capture, /grantArmed\(callback\)/);
  assert.match(capture, /loopback/);
  assert.match(capture, /thumbnailSize: THUMBNAIL_SIZE/);

  // O que travava o .exe: system picker (no-op no Windows) e round-trip de IPC
  // com o getDisplayMedia pendurado esperando resposta do renderer.
  assert.doesNotMatch(capture, /useSystemPicker/);
  assert.doesNotMatch(capture, /screenPickerCallback/);
  assert.doesNotMatch(capture, /webContents\.send\(\s*"screenPicker"/);
  assert.doesNotMatch(capture, /waitForPick/);
  assert.doesNotMatch(capture, /Menu\.buildFromTemplate/);

  // Thumbnails de verdade no picker.
  assert.match(map, /toDataURL/);
  assert.doesNotMatch(capture, /width:\s*0/);

  assert.match(preload, /listScreenSources/);
  assert.match(preload, /armScreenShare/);
  assert.doesNotMatch(preload, /onceScreenPicker/);
  assert.doesNotMatch(preload, /screenPickerCallback/);
  assert.doesNotMatch(preload, /sendSync/);
  assert.match(main, /permission === "display-capture"/);
});
