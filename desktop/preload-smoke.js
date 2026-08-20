"use strict";

// Electron entrypoint used only by preload.test.js: boots a hidden window with
// the real preload under the real sandbox settings and reports what the bridge
// actually exposed. A regex over preload.js cannot catch a preload that throws
// at load time, which is exactly how window.native went missing before.

const { app, BrowserWindow } = require("electron");
const path = require("path");

const VERSION = "9.9.9-smoke";

app.disableHardwareAcceleration();

/** Emit a single machine-readable line for the test runner to parse. */
function report(payload) {
  process.stdout.write(`MUCHAT_BRIDGE ${JSON.stringify(payload)}\n`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      additionalArguments: [`--muchat-version=${VERSION}`],
    },
  });

  try {
    await win.loadURL("about:blank");
    const bridge = await win.webContents.executeJavaScript(`(() => ({
      type: typeof window.native,
      keys: window.native ? Object.keys(window.native) : [],
      version: window.native ? window.native.versions.desktop() : null,
      chrome: window.native ? window.native.versions.chrome() : null,
    }))()`);
    report(bridge);
    app.exit(0);
  } catch (err) {
    report({ type: "error", error: String((err && err.message) || err) });
    app.exit(1);
  }
});
