"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  CSS_RADIUS_PX,
  DEFAULT_BG,
  TRANSPARENT_BG,
  chromeArgvFlags,
  hasCustomFrame,
  isReloadKey,
  isWindows11,
  roundMode,
  sanitiseWindowBackground,
  windowBackgroundForState,
  windowChromeOptions,
} = require("./chrome");

test("Win11 usa DWM; Win10 usa janela transparente para o raio CSS", () => {
  assert.equal(isWindows11("10.0.19045", "win32"), false);
  assert.equal(isWindows11("10.0.22000", "win32"), true);
  assert.equal(isWindows11("10.0.22631", "win32"), true);
  assert.equal(isWindows11("10.0.22631", "linux"), false);
  assert.equal(roundMode("10.0.19045", "win32"), "css");
  assert.equal(roundMode("10.0.22631", "win32"), "native");
  assert.equal(roundMode("10.0.22631", "darwin"), "none");
  assert.equal(hasCustomFrame("win32"), true);
  assert.equal(hasCustomFrame("darwin"), false);

  const win10 = windowChromeOptions({ platform: "win32", release: "10.0.19045" });
  assert.equal(win10.frame, false);
  assert.equal(win10.transparent, true);
  assert.equal(win10.backgroundColor, TRANSPARENT_BG);

  const win11 = windowChromeOptions({ platform: "win32", release: "10.0.22631" });
  assert.equal(win11.frame, false);
  assert.equal(win11.transparent, false);
  assert.equal(win11.roundedCorners, true);
  assert.equal(win11.backgroundColor, DEFAULT_BG);

  const mac = windowChromeOptions({ platform: "darwin", release: "23.0.0" });
  assert.equal(mac.frame, true);
  assert.equal(mac.transparent, undefined);
});

test("argv do preload descreve o chrome sem require relativo", () => {
  assert.deepEqual(chromeArgvFlags("darwin", "23.0.0"), []);
  assert.deepEqual(chromeArgvFlags("win32", "10.0.19045"), [
    "--muchat-frame=custom",
    "--muchat-round=css",
  ]);
  assert.deepEqual(chromeArgvFlags("win32", "10.0.22631"), [
    "--muchat-frame=custom",
    "--muchat-round=native",
  ]);
});

test("fundo da HWND some no Win10 restaurado para o raio CSS aparecer", () => {
  assert.equal(sanitiseWindowBackground("#1a1816"), "#1a1816");
  assert.equal(sanitiseWindowBackground("#fff"), "");
  assert.equal(sanitiseWindowBackground("red"), "");
  assert.equal(windowBackgroundForState("#1a1816", "css", false), TRANSPARENT_BG);
  assert.equal(windowBackgroundForState("#1a1816", "css", true), "#1a1816");
  assert.equal(windowBackgroundForState("#1a1816", "native", false), "#1a1816");
});

test("F5 e Ctrl+R são reload; F12 e o resto passam", () => {
  assert.equal(isReloadKey({ type: "keyDown", key: "F5" }), true);
  assert.equal(isReloadKey({ type: "keyDown", key: "f5", control: true }), true);
  assert.equal(isReloadKey({ type: "keyDown", key: "r", control: true }), true);
  assert.equal(isReloadKey({ type: "keyDown", key: "R", control: true, shift: true }), true);
  assert.equal(isReloadKey({ type: "keyDown", key: "r", meta: true }), true);
  assert.equal(isReloadKey({ type: "keyDown", key: "F12" }), false);
  assert.equal(isReloadKey({ type: "keyDown", key: "i", control: true, shift: true }), false);
  assert.equal(isReloadKey({ type: "keyUp", key: "F5" }), false);
});

test("o shell liga frame custom, bloqueio de reload e chrome.js no pacote", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");
  const splash = fs.readFileSync(path.join(__dirname, "splash.html"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));

  assert.ok(pkg.build.files.includes("chrome.js"));
  assert.match(main, /windowChromeOptions/);
  assert.match(main, /before-input-event/);
  assert.match(main, /isReloadKey/);
  assert.match(main, /Menu\.setApplicationMenu\(null\)/);
  assert.match(main, /chromeArgvFlags/);
  assert.match(main, /setWindowBackground/);
  assert.match(main, /IS_DEV_ORIGIN/);
  assert.match(preload, /hasCustomFrame/);
  assert.match(preload, /usesCssRoundedCorners/);
  assert.match(preload, /--muchat-frame=custom/);
  assert.match(preload, /setWindowBackground/);
  assert.match(splash, /-webkit-app-region:\s*drag/);
  assert.match(splash, /id="min"/);
  assert.match(splash, /id="max"/);
  assert.match(splash, /id="close"/);
  assert.match(splash, /muchat-css-round/);
  assert.match(splash, new RegExp(`border-radius:\\s*${CSS_RADIUS_PX}px`));
  assert.match(main, /window\.native&&window\.native\.close\(\)/);
});
