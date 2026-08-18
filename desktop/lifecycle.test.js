"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldHideToTray } = require("./lifecycle");

test("X esconde para a bandeja; Fechar Muchat encerra", () => {
  assert.equal(shouldHideToTray(false), true);
  assert.equal(shouldHideToTray(true), false);
});
