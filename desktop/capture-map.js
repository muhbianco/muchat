"use strict";

function mapSources(sources) {
  return sources.map((source, idx) => ({
    idx,
    name: source.name || `Fonte ${idx + 1}`,
    isFullScreen: String(source.id || "").startsWith("screen"),
  }));
}

module.exports = { mapSources };
