"use strict";

function toDataUrl(image) {
  if (!image || typeof image.toDataURL !== "function") return undefined;
  try {
    if (typeof image.getAspectRatio === "function" && typeof image.resize === "function") {
      if (image.getAspectRatio() > 1) image.resize({ width: 256 });
      else image.resize({ height: 256 });
    }
    return image.toDataURL();
  } catch {
    return undefined;
  }
}

function mapSources(sources) {
  return sources.map((source, idx) => ({
    idx,
    name: source.name,
    isFullScreen: String(source.id || "").startsWith("screen"),
    image: toDataUrl(source.appIcon),
    thumbnail: toDataUrl(source.thumbnail),
  }));
}

module.exports = { mapSources };
