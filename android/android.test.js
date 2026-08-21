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
const capture = fs.readFileSync(
  path.join(
    root,
    "app/src/main/java/br/com/muhbianco/muchat/ScreenCaptureService.java"
  ),
  "utf8"
);
const layout = fs.readFileSync(
  path.join(root, "app/src/main/res/layout/activity_main.xml"),
  "utf8"
);
const gradle = fs.readFileSync(path.join(root, "app/build.gradle"), "utf8");

test("apk empacota o chat Muchat com camera e microfone", () => {
  assert.match(manifest, /android.permission.CAMERA/);
  assert.match(manifest, /android.permission.RECORD_AUDIO/);
  assert.match(gradle, /applicationId "br.com.muhbianco.muchat"/);
  assert.match(gradle, /versionName "1\.0\.8"/);
  assert.match(gradle, /versionCode 108/);
  assert.match(gradle, /androidx.webkit:webkit/);
  assert.match(manifest, /FOREGROUND_SERVICE_MEDIA_PROJECTION/);
  assert.match(manifest, /ScreenCaptureService/);
  assert.match(activity, /chat\.muhbianco\.com\.br/);
  assert.match(activity, /RESOURCE_VIDEO_CAPTURE/);
  assert.match(activity, /MuchatNative/);
  assert.match(activity, /hideSplash/);
  assert.equal(
    fs.existsSync(path.join(root, "app/src/main/res/mipmap-xxxhdpi/ic_launcher.png")),
    true
  );
});

test("webview fica invisivel ate o splash nativo sair", () => {
  assert.match(layout, /android:visibility="invisible"/);
  assert.match(activity, /webView\.setVisibility\(View\.VISIBLE\)/);
  assert.match(activity, /class MuchatNative/);
  assert.match(activity, /public void hideSplash/);
});

test("share de tela usa MediaProjection com token, nao o stub antigo", () => {
  assert.match(activity, /startScreenShare/);
  assert.match(activity, /stopScreenShare/);
  assert.match(activity, /createScreenCaptureIntent/);
  assert.match(activity, /__muchatScreenShare/);
  assert.match(capture, /EXTRA_RESULT_CODE/);
  assert.match(capture, /FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION/);
  assert.match(capture, /ic_stat_muchat/);
  assert.doesNotMatch(capture, /ic_menu_camera/);
  assert.ok(
    capture.indexOf("startForeground") > capture.indexOf("onStartCommand"),
    "FGS so pode subir em onStartCommand, depois do token"
  );
});

test("for-web expõe o contrato que o APK implementa", () => {
  const forWeb = path.join(root, "..", "..", "for-web", "packages", "client");
  const splash = fs.readFileSync(path.join(forWeb, "src", "splash.ts"), "utf8");
  const html = fs.readFileSync(path.join(forWeb, "index.html"), "utf8");
  const polyfill = fs.readFileSync(
    path.join(forWeb, "components", "rtc", "androidDisplayMedia.ts"),
    "utf8"
  );
  const rtc = fs.readFileSync(
    path.join(forWeb, "components", "rtc", "index.ts"),
    "utf8"
  );
  assert.match(splash, /MuchatNative\?\.hideSplash/);
  assert.match(html, /\/assets\/web\/android-chrome-192x192\.png/);
  assert.doesNotMatch(html, /\.\/public\/assets/);
  assert.match(polyfill, /startScreenShare/);
  assert.match(polyfill, /__muchatScreenShare/);
  assert.match(rtc, /shouldUseAndroidCapture/);
  assert.equal(
    fs.existsSync(
      path.join(
        forWeb,
        "scripts",
        "assets_fallback",
        "web",
        "android-chrome-192x192.png"
      )
    ),
    true
  );
});
