const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "public", "boot.css"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "public", "boot.js"), "utf8");

test("overlay de voz preenche o palco e prioriza o tile com video", () => {
  assert.match(css, /muchat-voice-stage/);
  assert.match(css, /muchat-hide-text/);
  assert.match(css, /transform:\s*none\s*!important/);
  assert.match(css, /--muchat-stage-left/);
  assert.match(css, /\.vc_tile:has\(video\)/);
  assert.match(js, /muchat-voice-stage/);
  assert.match(js, /promoteShare/);
  assert.match(js, /muchat-chat-toggle/);
  assert.match(js, /Mostrar chat/);
  assert.match(js, /Esconder chat/);
  assert.match(js, /CHAT_PREF/);
  assert.match(js, /data-muchat-stage/);
  assert.match(js, /fillStageBox/);
  assert.match(js, /hideTextPane/);
  assert.match(js, /findGrayCard/);
});

test("splash e picker de tela no overlay", () => {
  assert.match(css, /#muchat-splash/);
  assert.match(js, /muchat-splash/);
  assert.match(js, /splashReady/);
  assert.match(js, /MuchatNative/);
  assert.match(js, /muchat-screen-picker/);
  assert.match(js, /onceScreenPicker/);
  assert.match(css, /muchat-splash-bar/);
  assert.match(js, /Carregando/);
  assert.match(js, /onLoadProgress/);
  assert.match(js, /startVoiceStageOnce/);
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
