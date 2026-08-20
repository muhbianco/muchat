"use strict";

// Launches the shell against a local for-web dev server instead of production.
// Keeps the invocation identical on PowerShell and POSIX shells, where inline
// env vars are not portable.
//   node dev.js                       -> http://localhost:5173
//   node dev.js http://localhost:3000 -> custom origin

const { spawn } = require("child_process");
const electron = require("electron");

const origin = process.argv[2] || process.env.MUCHAT_ORIGIN || "http://localhost:5173";

console.log(`Muchat dev -> ${origin}`);

const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: { ...process.env, MUCHAT_ORIGIN: origin },
});

child.on("close", (code) => process.exit(code ?? 0));
