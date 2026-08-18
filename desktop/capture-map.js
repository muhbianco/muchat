"use strict";

function mapSources(sources) {
  return sources.map((source, idx) => {
    const image = source.appIcon;
    if (image) {
      if (image.getAspectRatio() > 1) image.resize({ width: 256 });
      else image.resize({ height: 256 });
    }
    return {
      idx,
      name: source.name,
      isFullScreen: String(source.id || "").startsWith("screen"),
      image: image ? image.toDataURL() : undefined,
    };
  });
}

module.exports = { mapSources };
