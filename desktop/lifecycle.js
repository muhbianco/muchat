"use strict";

function shouldHideToTray(isQuitting) {
  return !isQuitting;
}

module.exports = { shouldHideToTray };
