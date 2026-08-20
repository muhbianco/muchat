"use strict";

const THUMB_LIMIT = 64 * 1024;

/**
 * Serialise a NativeImage to a data URL, dropping it when it is empty or too
 * heavy to be worth sending over IPC for a picker thumbnail.
 */
function toDataUrl(image) {
  if (!image || typeof image.toDataURL !== "function") return undefined;
  try {
    if (typeof image.isEmpty === "function" && image.isEmpty()) return undefined;
    const url = image.toDataURL();
    if (!url || url.length > THUMB_LIMIT) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

/**
 * Map desktopCapturer sources onto the payload the renderer picker consumes.
 * Sources are addressed by their stable Chromium id, never by array index, so a
 * source list that shifts between listing and arming cannot capture the wrong
 * window.
 */
function mapSources(sources) {
  return (sources || []).map((source, idx) => ({
    id: String(source.id || ""),
    name: source.name || `Fonte ${idx + 1}`,
    isFullScreen: String(source.id || "").startsWith("screen"),
    thumbnail: toDataUrl(source.thumbnail),
    appIcon: toDataUrl(source.appIcon),
  }));
}

module.exports = { mapSources, toDataUrl, THUMB_LIMIT };
