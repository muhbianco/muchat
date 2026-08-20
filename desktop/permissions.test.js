"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isAppOrigin,
  isAllowedPermission,
  normaliseOrigin,
  APP_ORIGIN,
  PROD_ORIGIN,
  IS_DEV_ORIGIN,
} = require("./permissions");

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

test("MUCHAT_ORIGIN troca o origin do app só quando é uma URL válida", () => {
  assert.equal(normaliseOrigin("http://localhost:5173"), "http://localhost:5173");
  assert.equal(normaliseOrigin(" http://localhost:5173/ "), "http://localhost:5173");
  assert.equal(normaliseOrigin("localhost:5173"), "");
  assert.equal(normaliseOrigin(""), "");
  assert.equal(normaliseOrigin(undefined), "");
  // Sem override o teste roda em produção, então o origin não muda.
  if (!process.env.MUCHAT_ORIGIN) {
    assert.equal(APP_ORIGIN, PROD_ORIGIN);
    assert.equal(IS_DEV_ORIGIN, false);
  }
});
