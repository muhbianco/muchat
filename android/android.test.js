"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const manifest = fs.readFileSync(
  path.join(root, "app/src/main/AndroidManifest.xml"),
  "utf8"
);
const activity = fs.readFileSync(
  path.join(root, "app/src/main/java/br/com/muhbianco/muchat/MainActivity.java"),
  "utf8"
);
const gradle = fs.readFileSync(path.join(root, "app/build.gradle"), "utf8");

test("apk empacota o chat Muchat com camera e microfone", () => {
  assert.match(manifest, /android.permission.CAMERA/);
  assert.match(manifest, /android.permission.RECORD_AUDIO/);
  assert.match(gradle, /applicationId "br.com.muhbianco.muchat"/);
  assert.match(gradle, /versionName "1\.0\.6"/);
  assert.match(activity, /chat\.muhbianco\.com\.br/);
  assert.match(activity, /RESOURCE_VIDEO_CAPTURE/);
  assert.equal(
    fs.existsSync(path.join(root, "app/src/main/res/mipmap-xxxhdpi/ic_launcher.png")),
    true
  );
});
