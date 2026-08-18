const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const soundsDir = path.join(__dirname, "public", "sounds");
const expected = [
  "mute",
  "unmute",
  "deafen",
  "undeafen",
  "userJoinVoice",
  "userLeaveVoice",
  "streamStart",
  "streamEnd",
  "event",
];

test("wavs de evento existem e são RIFF", () => {
  for (const name of expected) {
    const file = path.join(soundsDir, `${name}.wav`);
    assert.equal(fs.existsSync(file), true, name);
    const buf = fs.readFileSync(file);
    assert.equal(buf.subarray(0, 4).toString(), "RIFF");
    assert.ok(buf.length > 200, name);
  }
});
