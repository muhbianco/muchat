const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "public", "boot.css"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "public", "boot.js"), "utf8");

test("overlay de voz preenche o palco e prioriza o tile com video", () => {
  assert.match(css, /muchat-voice-stage/);
  assert.match(css, /100dvh - var\(--muchat-voice-top\)/);
  assert.match(css, /\.vc_tile:has\(video\)/);
  assert.match(js, /muchat-voice-stage/);
  assert.match(js, /promoteShare/);
});
