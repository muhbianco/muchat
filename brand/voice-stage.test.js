const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "public", "boot.css"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "public", "boot.js"), "utf8");

test("overlay de voz deixa a box cinza redimensionavel", () => {
  assert.match(css, /muchat-voice-stage/);
  assert.match(css, /#muchat-stage-handle/);
  assert.match(css, /cursor:\s*ns-resize/);
  assert.match(css, /\.vc_tile:has\(video\)/);
  assert.doesNotMatch(css, /muchat-hide-text/);
  assert.doesNotMatch(css, /#muchat-chat-toggle/);
  assert.doesNotMatch(js, /Esconder chat/);
  assert.doesNotMatch(js, /hideTextPane/);
  assert.match(js, /muchat-voice-stage/);
  assert.match(js, /promoteShare/);
  assert.match(js, /data-muchat-stage/);
  assert.match(js, /data-muchat-mount/);
  assert.match(js, /findGrayCard/);
  assert.match(js, /findStageCard/);
  assert.match(js, /applyStageHeight/);
  assert.match(js, /placeStageHandle/);
  assert.match(js, /containsComposer/);
  assert.match(js, /pinComposer/);
  assert.match(js, /data-muchat-composer/);
  assert.match(js, /flex-shrink/);
  assert.match(css, /data-muchat-composer/);
  assert.match(js, /raiseStoatModals/);
  assert.match(js, /10002/);
  assert.match(js, /muchat-voice-dock/);
});

test("splash e picker de tela no overlay", () => {
  assert.match(css, /#muchat-splash/);
  assert.match(js, /muchat-splash/);
  assert.match(js, /splashReady/);
  assert.match(js, /MuchatNative/);
  assert.match(js, /muchat-screen-picker/);
  assert.match(js, /onceScreenPicker/);
  assert.match(js, /SHARE_QUALITY/);
  assert.match(js, /patchGetDisplayMedia/);
  assert.match(css, /muchat-screen-picker__quality/);
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
