"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const preloadSource = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");

/** Resolve the local Electron binary, or "" when dependencies are not installed. */
function electronBinary() {
  try {
    // Required from plain node, the electron package exports its binary path.
    const binary = require("electron");
    return typeof binary === "string" && fs.existsSync(binary) ? binary : "";
  } catch {
    return "";
  }
}

test("o preload não usa require relativo (proibido sob sandbox)", () => {
  const relativeRequires = preloadSource.match(/require\(\s*["'](\.\.?\/)/g) || [];
  assert.deepEqual(
    relativeRequires,
    [],
    "um require relativo joga antes do exposeInMainWorld e mata window.native",
  );
  assert.match(preloadSource, /--muchat-version=/);
  assert.match(mainSource, /additionalArguments/);
  assert.match(mainSource, /--muchat-version=\$\{version\}/);
});

test("o preload sandboxed expõe window.native de verdade", (t) => {
  const binary = electronBinary();
  if (!binary) {
    t.skip("electron não instalado; rode npm install em desktop/");
    return;
  }

  const run = spawnSync(binary, [path.join(__dirname, "preload-smoke.js")], {
    encoding: "utf8",
    timeout: 120000,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  });

  const output = `${run.stdout || ""}${run.stderr || ""}`;
  const line = output.match(/MUCHAT_BRIDGE (\{.*\})/);
  assert.ok(line, `o smoke não reportou o bridge:\n${output}`);

  const bridge = JSON.parse(line[1]);
  assert.equal(bridge.type, "object", `window.native não foi exposto: ${line[1]}`);
  assert.equal(bridge.version, "9.9.9-smoke");
  assert.ok(bridge.chrome, "versions.chrome() deveria responder");

  for (const api of [
    "versions",
    "minimise",
    "maximise",
    "close",
    "listScreenSources",
    "armScreenShare",
    "splashReady",
    "onLoadProgress",
    "onAppUpdate",
    "getUpdateState",
    "installAppUpdate",
  ]) {
    assert.ok(bridge.keys.includes(api), `falta ${api} no bridge`);
  }
});
