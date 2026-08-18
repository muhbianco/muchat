"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isAppOrigin, isAllowedPermission } = require("./permissions");

test("aceita só o chat Muchat", () => {
  assert.equal(isAppOrigin("https://chat.muhbianco.com.br"), true);
  assert.equal(isAppOrigin("https://chat.muhbianco.com.br/login"), true);
  assert.equal(isAppOrigin("https://evil.example/"), false);
  assert.equal(isAppOrigin(""), false);
});

test("libera notificação e mídia no origin do app", () => {
  const origin = "https://chat.muhbianco.com.br/";
  assert.equal(isAllowedPermission("notifications", origin), true);
  assert.equal(isAllowedPermission("display-capture", origin), true);
  assert.equal(isAllowedPermission("camera", origin), true);
  assert.equal(isAllowedPermission("media", "https://chat.muhbianco.com.br/login?x=1"), true);
  assert.equal(isAllowedPermission("geolocation", origin), false);
  assert.equal(isAllowedPermission("notifications", "https://evil.example/"), false);
});
