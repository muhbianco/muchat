"use strict";

function shouldDisableWgcCapturer(env, platform) {
  const runtime = env || process.env;
  const os = platform || process.platform;
  if (os !== "win32") return false;
  const sessionName = String(runtime.SESSIONNAME || "Console");
  return sessionName !== "Console";
}

module.exports = { shouldDisableWgcCapturer };
