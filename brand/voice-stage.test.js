const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "public", "boot.css"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "public", "boot.js"), "utf8");

test("overlay de voz preenche o palco e prioriza o tile com video", () => {
  assert.match(css, /muchat-voice-stage/);
  assert.match(css, /100dvh - var\(--muchat-voice-top\)/);
  assert.match(css, /muchat-hide-text/);
  assert.match(css, /\.vc_tile:has\(video\)/);
  assert.match(js, /muchat-voice-stage/);
  assert.match(js, /promoteShare/);
  assert.match(js, /muchat-chat-toggle/);
  assert.match(js, /CHAT_PREF/);
});

test("splash e picker de tela no overlay", () => {
  assert.match(css, /#muchat-splash/);
  assert.match(js, /muchat-splash/);
  assert.match(js, /splashReady/);
  assert.match(js, /MuchatNative/);
  assert.match(js, /muchat-screen-picker/);
  assert.match(js, /onceScreenPicker/);
  assert.match(js, /join the voice channel/);
});

test("dock de voz no rodape da lista de canais", () => {
  assert.match(css, /#muchat-voice-dock/);
  assert.match(js, /muchat-voice-dock/);
  assert.match(js, /callActions/);
  assert.match(js, /data-act="hangup"/);
});

test("menu remove usuario so da call", () => {
  assert.match(js, /Remover da call/);
  assert.match(js, /VoiceChannel/);
  assert.match(css, /muchat-disconnect-voice/);
});

test("getUserMedia tenta de novo sem deviceId velho", () => {
  assert.match(js, /stripVideoDeviceId/);
  assert.match(js, /unconstrainedVideo/);
  assert.match(js, /patchGetUserMedia/);
});
