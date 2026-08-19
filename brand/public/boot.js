(() => {
  const NAME = "Muchat";
  const SOUND_FILES = {
    mute: "/muchat-brand/sounds/mute.wav",
    unmute: "/muchat-brand/sounds/unmute.wav",
    deafen: "/muchat-brand/sounds/deafen.wav",
    undeafen: "/muchat-brand/sounds/undeafen.wav",
    userJoinVoice: "/muchat-brand/sounds/userJoinVoice.wav",
    userLeaveVoice: "/muchat-brand/sounds/userLeaveVoice.wav",
    userMoved: "/muchat-brand/sounds/userMoved.wav",
    streamStart: "/muchat-brand/sounds/streamStart.wav",
    streamEnd: "/muchat-brand/sounds/streamEnd.wav",
    streamViewerJoin: "/muchat-brand/sounds/streamViewerJoin.wav",
    streamViewerLeave: "/muchat-brand/sounds/streamViewerLeave.wav",
    ringtoneIncoming: "/muchat-brand/sounds/ringtoneIncoming.wav",
    ringtoneOutgoing: "/muchat-brand/sounds/ringtoneOutgoing.wav",
  };
  const FALLBACK_SOUND = "/muchat-brand/sounds/event.wav";
  const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
  const usersByName = new Map();
  let sessionToken = "";
  let pendingMenuUser = "";

  function rememberUser(id, username) {
    if (typeof id !== "string" || !ULID.test(id)) return;
    if (typeof username !== "string" || !username) return;
    usersByName.set(username.toLowerCase(), id);
  }

  function indexTree(value, depth) {
    if (depth > 6 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      const cap = Math.min(value.length, 400);
      for (let i = 0; i < cap; i++) indexTree(value[i], depth + 1);
      return;
    }
    rememberUser(value._id || value.id, value.username);
    for (const nested of Object.values(value)) indexTree(nested, depth + 1);
  }

  function tokenFromHeaders(headers) {
    if (!headers) return "";
    if (typeof headers.get === "function") {
      return headers.get("X-Session-Token") || headers.get("x-session-token") || "";
    }
    return headers["X-Session-Token"] || headers["x-session-token"] || "";
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input, init) {
    const token = tokenFromHeaders(init && init.headers);
    if (token) sessionToken = token;
    return origFetch(input, init).then((res) => {
      const copy = res.clone();
      copy.json().then((body) => indexTree(body, 0)).catch(() => {});
      return res;
    });
  };

  const NativeWebSocket = window.WebSocket;
  window.WebSocket = class MuchatWebSocket extends NativeWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      this.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        try {
          indexTree(JSON.parse(event.data), 0);
        } catch {
          /* ignore non-JSON frames */
        }
      });
    }
  };

  function stripVideoDeviceId(constraints) {
    if (!constraints || typeof constraints !== "object") return null;
    const video = constraints.video;
    if (!video || typeof video !== "object" || video.deviceId == null) return null;
    const nextVideo = { ...video };
    delete nextVideo.deviceId;
    return { ...constraints, video: Object.keys(nextVideo).length ? nextVideo : true };
  }

  function unconstrainedVideo(constraints) {
    if (!constraints || typeof constraints !== "object" || !constraints.video) return null;
    if (constraints.video === true) return null;
    return { ...constraints, video: true };
  }

  function patchGetUserMedia() {
    const devices = navigator.mediaDevices;
    if (!devices || !devices.getUserMedia) return;
    const orig = devices.getUserMedia.bind(devices);
    const wrapped = async (constraints) => {
      try {
        return await orig(constraints);
      } catch (err) {
        const withoutId = stripVideoDeviceId(constraints);
        if (withoutId) {
          try {
            return await orig(withoutId);
          } catch {
            /* fall through to unconstrained video */
          }
        }
        const plain = unconstrainedVideo(constraints);
        if (!plain) throw err;
        return orig(plain);
      }
    };
    devices.getUserMedia = wrapped;
  }
  try {
    patchGetUserMedia();
  } catch {
    /* never block the Stoat bundle */
  }

  document.addEventListener(
    "contextmenu",
    (event) => {
      let el = event.target;
      for (let i = 0; i < 8 && el; i++) {
        const first = ((el.innerText || "").trim().split("\n")[0] || "").trim();
        if (first.length >= 2 && first.length <= 32 && !/kick|volume|mute|profile/i.test(first)) {
          pendingMenuUser = first;
          break;
        }
        el = el.parentElement;
      }
    },
    true
  );

  const paint = () => {
    if (document.title && document.title.includes("Stoat")) {
      document.title = document.title.replace(/Stoat/g, NAME);
    }
    if (!document.title || document.title === "Stoat") {
      document.title = NAME;
    }
  };
  paint();
  const title = document.querySelector("title");
  if (title) {
    new MutationObserver(paint).observe(title, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function notifyNativeSplashDone() {
    try {
      if (window.native && typeof window.native.splashReady === "function") {
        window.native.splashReady();
      }
    } catch {
      /* ignore */
    }
    try {
      if (window.MuchatNative && typeof window.MuchatNative.hideSplash === "function") {
        window.MuchatNative.hideSplash();
      }
    } catch {
      /* ignore */
    }
  }

  let splashHidden = false;
  function uiLooksReady() {
    const root = document.getElementById("root");
    if (!root || root.childElementCount === 0) return false;
    if (root.getBoundingClientRect().height < 80) return false;
    const text = (root.innerText || "").replace(/\s+/g, " ").trim();
    if (text.length >= 24) return true;
    return Boolean(root.querySelector("input, button, textarea, canvas, img"));
  }

  function setSplashProgress(pct, label) {
    const bar = document.getElementById("muchat-splash-bar");
    const text = document.querySelector("#muchat-splash .muchat-splash-label");
    if (bar) {
      const n = Math.max(8, Math.min(100, Number(pct) || 0));
      bar.classList.remove("is-indeterminate");
      bar.style.width = `${n}%`;
    }
    if (text && label) text.textContent = label;
  }

  function ensureSplash() {
    if (document.getElementById("muchat-splash") || splashHidden) return;
    const el = document.createElement("div");
    el.id = "muchat-splash";
    el.innerHTML =
      '<img src="/muchat-brand/icon.png" alt="Muchat" width="96" height="96">' +
      '<div class="muchat-splash-track"><div class="muchat-splash-bar is-indeterminate" id="muchat-splash-bar"></div></div>' +
      '<p class="muchat-splash-label">Carregando…</p>';
    (document.body || document.documentElement).appendChild(el);
    try {
      if (window.native && typeof window.native.onLoadProgress === "function") {
        window.native.onLoadProgress(setSplashProgress);
      }
    } catch {
      /* ignore */
    }
  }

  let voiceStageStarted = false;
  function hideSplash() {
    if (splashHidden) return;
    splashHidden = true;
    const el = document.getElementById("muchat-splash");
    if (el) el.remove();
    notifyNativeSplashDone();
    startVoiceStageOnce();
  }

  function startSplash() {
    ensureSplash();
    const host = document.getElementById("root") || document.body;
    const obs = new MutationObserver(() => {
      if (!uiLooksReady()) return;
      obs.disconnect();
      hideSplash();
    });
    if (host) obs.observe(host, { childList: true, subtree: true });
    if (uiLooksReady()) hideSplash();
    setTimeout(hideSplash, 12000);
  }
  startSplash();

  // Stoat empacota mute/call/stream como ogg vazio (data URI). Só "message" é arquivo real.
  // Proxy(Audio) não intercepta o construtor nativo no Chromium/Electron — wrapper + play().
  let pendingSound = "";

  const origBind = Function.prototype.bind;
  Function.prototype.bind = function bindPatched(...args) {
    const bound = origBind.apply(this, args);
    if (typeof this !== "function" || this.name !== "playSound") return bound;
    return function playSoundPatched(sound) {
      if (typeof sound === "string") pendingSound = sound;
      return bound.apply(this, arguments);
    };
  };

  function remapSoundSrc(src) {
    if (typeof src !== "string" || !src.startsWith("data:audio")) return src;
    const next = SOUND_FILES[pendingSound] || FALLBACK_SOUND;
    pendingSound = "";
    return next;
  }

  const NativeAudio = window.Audio;
  function AudioPatched(src) {
    const node = new NativeAudio(remapSoundSrc(src));
    return node;
  }
  AudioPatched.prototype = NativeAudio.prototype;
  Object.setPrototypeOf(AudioPatched, NativeAudio);
  window.Audio = AudioPatched;

  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function playPatched() {
    const src = this.getAttribute("src") || this.src || "";
    const next = remapSoundSrc(src);
    if (next !== src) {
      this.src = next;
      this.load();
    }
    return origPlay.apply(this, arguments);
  };

  // Palco de voz: a box cinza estica pela borda de baixo; o chat fica embaixo.
  const VOICE_STAGE = "muchat-voice-stage";
  const STAGE_H_PREF = "muchat-voice-h";
  const STAGE_MIN = 160;
  let shareAutoFocused = false;
  let stageDragging = false;
  let stageDragStartY = 0;
  let stageDragStartH = 0;

  function promoteShare() {
    const videos = [
      ...document.querySelectorAll("#floating .vc_tile video"),
    ].filter((el) => el instanceof HTMLVideoElement && el.readyState >= 2);
    if (!videos.length) {
      shareAutoFocused = false;
      return;
    }
    if (shareAutoFocused) return;
    const best = videos.reduce((a, b) =>
      b.videoWidth * b.videoHeight > a.videoWidth * a.videoHeight ? b : a
    );
    const tile = best.closest(".vc_tile");
    if (!(tile instanceof HTMLElement)) return;
    const grid = tile.parentElement;
    if (grid && getComputedStyle(grid).flexDirection === "column") {
      shareAutoFocused = true;
      return;
    }
    tile.click();
    shareAutoFocused = true;
  }

  function important(el, prop, value) {
    el.style.setProperty(prop, value, "important");
  }

  function inVoiceCall() {
    if (document.fullscreenElement) return false;
    if (callActions()) return true;
    return Boolean(document.querySelector("#floating .vc_tile"));
  }

  function isOpaqueBg(el) {
    const bg = getComputedStyle(el).backgroundColor || "";
    if (!bg || bg === "transparent") return false;
    const m = bg.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(",").map((part) => Number(part.trim()));
      if (parts.length === 4 && parts[3] === 0) return false;
    }
    return true;
  }

  function findGrayCard(fromBtn) {
    let el = fromBtn;
    let best = null;
    while (el && el.id !== "floating" && el !== document.body) {
      if (el.id === "muchat-voice-dock") {
        el = el.parentElement;
        continue;
      }
      const box = el.getBoundingClientRect();
      if (isOpaqueBg(el) && box.width >= 280) {
        if (!best || box.width >= best.getBoundingClientRect().width - 8) {
          best = el;
        }
      }
      el = el.parentElement;
    }
    return best;
  }

  function findStageCard() {
    const tile = document.querySelector("#floating .vc_tile");
    if (tile) {
      const fromTile = findGrayCard(tile);
      if (fromTile) return fromTile;
    }
    const hangup = (callActions() || {}).hangup;
    if (hangup && !hangup.closest("#muchat-voice-dock")) {
      return findGrayCard(hangup);
    }
    return null;
  }

  function containsComposer(el) {
    if (!el || !el.querySelector) return false;
    for (const node of el.querySelectorAll("textarea, [contenteditable='true']")) {
      const ph = (
        node.getAttribute("placeholder") ||
        node.getAttribute("aria-label") ||
        ""
      ).toLowerCase();
      if (node.tagName === "TEXTAREA" || ph.includes("message") || node.isContentEditable) {
        return true;
      }
    }
    return false;
  }

  function findComposerBar() {
    const root = document.getElementById("root");
    if (!root) return null;
    for (const el of root.querySelectorAll("textarea, [contenteditable='true']")) {
      const ph = el.getAttribute("placeholder") || el.getAttribute("aria-label") || "";
      if (!/message/i.test(ph) && el.tagName !== "TEXTAREA") continue;
      let cur = el.parentElement;
      let best = el;
      for (let i = 0; i < 8 && cur && cur.id !== "root"; i++) {
        const box = cur.getBoundingClientRect();
        if (box.height > 180) break;
        if (box.width >= 200 && box.height >= 40) best = cur;
        cur = cur.parentElement;
      }
      return best;
    }
    return null;
  }

  function composerReserve() {
    const bar = findComposerBar();
    if (!bar) return 64;
    return Math.max(56, Math.round(bar.getBoundingClientRect().height));
  }

  function pinComposer() {
    const bar = findComposerBar();
    if (!bar) return;
    bar.setAttribute("data-muchat-composer", "1");
    important(bar, "flex-shrink", "0");
    important(bar, "min-height", "52px");
  }

  function stageMaxHeight() {
    return Math.max(STAGE_MIN + 40, innerHeight - 56 - composerReserve() - 12);
  }

  function clampStageHeight(px) {
    return Math.min(stageMaxHeight(), Math.max(STAGE_MIN, Math.round(Number(px) || 0)));
  }

  function readStageHeight() {
    const saved = Number(sessionStorage.getItem(STAGE_H_PREF));
    if (!Number.isFinite(saved) || saved < STAGE_MIN) return 0;
    return clampStageHeight(saved);
  }

  function fillCardColumn(card) {
    important(card, "display", "flex");
    important(card, "flex-direction", "column");
    for (const child of card.children) {
      if (!(child instanceof HTMLElement) || child.id === "muchat-stage-handle") continue;
      const text = child.textContent || "";
      const looksActions =
        text.includes("call_end") && child.getBoundingClientRect().height < 90;
      if (looksActions) {
        important(child, "flex", "0 0 auto");
        continue;
      }
      if (child.querySelector(".vc_tile, video")) {
        important(child, "flex", "1 1 auto");
        important(child, "min-height", "0");
        important(child, "max-height", "none");
        important(child, "height", "auto");
        important(child, "width", "100%");
      }
    }
  }

  function findVoiceMount(card) {
    const marked = document.querySelector("[data-muchat-mount]");
    if (marked && document.body.contains(marked) && !containsComposer(marked)) {
      return marked;
    }
    if (marked) {
      marked.style.removeProperty("height");
      marked.style.removeProperty("min-height");
      marked.style.removeProperty("max-height");
      marked.removeAttribute("data-muchat-mount");
    }
    const want = card.getBoundingClientRect();
    const root = document.getElementById("root");
    if (!root) return null;
    let best = null;
    let bestH = Infinity;
    for (const el of root.querySelectorAll("div")) {
      if (el === card || el.closest("#floating, #muchat-voice-dock, #muchat-stage-handle")) {
        continue;
      }
      if (containsComposer(el)) continue;
      const box = el.getBoundingClientRect();
      if (Math.abs(box.left - want.left) > 28) continue;
      if (Math.abs(box.width - want.width) > 28) continue;
      if (Math.abs(box.top - want.top) > 28) continue;
      if (box.height < 140) continue;
      if (box.height < bestH) {
        bestH = box.height;
        best = el;
      }
    }
    return best;
  }

  function applyStageHeight(card, height) {
    card.setAttribute("data-muchat-stage", "1");
    important(card, "height", `${height}px`);
    important(card, "min-height", `${height}px`);
    important(card, "max-height", `${height}px`);
    important(card, "overflow", "hidden");
    fillCardColumn(card);
    const mount = findVoiceMount(card);
    if (mount && mount !== card) {
      mount.setAttribute("data-muchat-mount", "1");
      important(mount, "height", `${height}px`);
      important(mount, "min-height", `${height}px`);
      important(mount, "max-height", `${height}px`);
    }
  }

  function raiseStoatModals() {
    const nodes = new Set([
      ...document.querySelectorAll('[role="dialog"], [aria-modal="true"]'),
      ...document.querySelectorAll("body > div"),
    ]);
    for (const el of nodes) {
      if (!el || (el.id && el.id.startsWith("muchat-"))) continue;
      if (el.id === "floating" || el.querySelector(".vc_tile, video")) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "absolute") continue;
      const box = el.getBoundingClientRect();
      if (box.width < 200 || box.height < 72) continue;
      if (box.width > innerWidth * 0.85 || box.height > innerHeight * 0.9) continue;
      important(el, "z-index", "10002");
      important(el, "pointer-events", "auto");
    }
  }

  function restoreStageBoxes() {
    document.documentElement.classList.remove("muchat-stage-dragging");
    stageDragging = false;
    for (const el of document.querySelectorAll("[data-muchat-stage], [data-muchat-mount], [data-muchat-composer]")) {
      for (const prop of [
        "height",
        "max-height",
        "min-height",
        "overflow",
        "display",
        "flex",
        "flex-direction",
        "flex-shrink",
      ]) {
        el.style.removeProperty(prop);
      }
      for (const child of el.children) {
        child.style.removeProperty("flex");
        child.style.removeProperty("min-height");
        child.style.removeProperty("width");
        child.style.removeProperty("max-height");
        child.style.removeProperty("height");
      }
      el.removeAttribute("data-muchat-stage");
      el.removeAttribute("data-muchat-mount");
      el.removeAttribute("data-muchat-composer");
    }
    const handle = document.getElementById("muchat-stage-handle");
    if (handle) handle.hidden = true;
  }

  function placeStageHandle(card) {
    let handle = document.getElementById("muchat-stage-handle");
    if (!handle) {
      handle = document.createElement("div");
      handle.id = "muchat-stage-handle";
      handle.title = "Arraste para redimensionar";
      handle.addEventListener("pointerdown", onStageHandleDown);
      handle.addEventListener("pointermove", onStageHandleMove);
      handle.addEventListener("pointerup", onStageHandleUp);
      handle.addEventListener("pointercancel", onStageHandleUp);
      document.body.appendChild(handle);
    }
    const box = card.getBoundingClientRect();
    handle.hidden = false;
    important(handle, "left", `${Math.round(box.left)}px`);
    important(handle, "width", `${Math.round(box.width)}px`);
    important(handle, "top", `${Math.round(box.bottom - 6)}px`);
  }

  function onStageHandleDown(event) {
    if (event.button != null && event.button !== 0) return;
    const card = findStageCard();
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    stageDragging = true;
    stageDragStartY = event.clientY;
    stageDragStartH = card.getBoundingClientRect().height;
    document.documentElement.classList.add("muchat-stage-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onStageHandleMove(event) {
    if (!stageDragging) return;
    const next = clampStageHeight(stageDragStartH + (event.clientY - stageDragStartY));
    sessionStorage.setItem(STAGE_H_PREF, String(next));
    layoutVoiceStage();
  }

  function onStageHandleUp(event) {
    if (!stageDragging) return;
    stageDragging = false;
    document.documentElement.classList.remove("muchat-stage-dragging");
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  }

  function layoutVoiceStage() {
    const card = findStageCard();
    if (!card) {
      restoreStageBoxes();
      return;
    }
    const saved = readStageHeight();
    if (saved) applyStageHeight(card, saved);
    else fillCardColumn(card);
    pinComposer();
    placeStageHandle(card);
    raiseStoatModals();
  }

  function syncVoiceStage() {
    const root = document.documentElement;
    if (!inVoiceCall()) {
      root.classList.remove(VOICE_STAGE);
      shareAutoFocused = false;
      restoreStageBoxes();
      return;
    }
    root.classList.add(VOICE_STAGE);
    layoutVoiceStage();
    promoteShare();
  }

  function findIcon(root, name) {
    if (!root) return null;
    for (const el of root.querySelectorAll("*")) {
      if (el.childElementCount === 0 && el.textContent.trim() === name) {
        return el;
      }
    }
    return null;
  }

  function iconButton(root, names) {
    for (const name of names) {
      const icon = findIcon(root, name);
      if (!icon) continue;
      const btn =
        icon.closest("button") || icon.closest("[role='button']");
      if (btn) return { name, btn };
    }
    return null;
  }

  function callActions() {
    const floating = document.getElementById("floating") || document;
    const end = iconButton(floating, ["call_end"]) || iconButton(document, ["call_end"]);
    if (!end) return null;
    const bar = end.btn.parentElement;
    if (!bar) return null;
    return {
      hangup: end.btn,
      mute: iconButton(bar, ["mic_off", "mic"]),
      deafen: iconButton(bar, ["headset_off", "headset"]),
      muted: !!findIcon(bar, "mic_off"),
      deafened: !!findIcon(bar, "headset_off"),
    };
  }

  function press(btn) {
    if (!btn || btn.disabled || btn.getAttribute("aria-disabled") === "true") {
      return;
    }
    btn.click();
  }

  function findChannelSidebar() {
    const root = document.getElementById("root");
    const hint =
      findIcon(root, "headset_mic") || findIcon(root, "grid_3x3");
    let el = hint ? hint.parentElement : null;
    while (el && el !== root) {
      const box = el.getBoundingClientRect();
      if (
        box.width >= 190 &&
        box.width <= 380 &&
        box.height >= innerHeight * 0.45 &&
        box.left >= 36 &&
        box.left <= 160
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  let dockPadded = null;

  function ensureDock() {
    let dock = document.getElementById("muchat-voice-dock");
    if (dock) return dock;
    dock = document.createElement("aside");
    dock.id = "muchat-voice-dock";
    dock.hidden = true;
    dock.innerHTML =
      '<div class="muchat-voice-dock__status">' +
      '<span class="muchat-voice-dock__live">Voz conectada</span>' +
      '<button type="button" class="muchat-voice-dock__btn is-hangup material-symbols-outlined" data-act="hangup" aria-label="Sair do canal">call_end</button>' +
      "</div>" +
      '<div class="muchat-voice-dock__actions">' +
      '<button type="button" class="muchat-voice-dock__btn material-symbols-outlined" data-act="mute" aria-label="Microfone">mic</button>' +
      '<button type="button" class="muchat-voice-dock__btn material-symbols-outlined" data-act="deafen" aria-label="Áudio">headset</button>' +
      "</div>";
    dock.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-act]");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      const actions = callActions();
      if (!actions) return;
      if (btn.getAttribute("data-act") === "mute") press(actions.mute && actions.mute.btn);
      if (btn.getAttribute("data-act") === "deafen") {
        press(actions.deafen && actions.deafen.btn);
      }
      if (btn.getAttribute("data-act") === "hangup") press(actions.hangup);
    });
    document.body.appendChild(dock);
    return dock;
  }

  function hideDock(dock) {
    dock.hidden = true;
    if (dockPadded) {
      dockPadded.style.paddingBottom = "";
      dockPadded = null;
    }
  }

  function syncVoiceDock() {
    const dock = ensureDock();
    const actions = callActions();
    const sidebar = findChannelSidebar();
    if (!actions || !sidebar || document.fullscreenElement) {
      hideDock(dock);
      return;
    }
    const muteBtn = dock.querySelector('[data-act="mute"]');
    const deafenBtn = dock.querySelector('[data-act="deafen"]');
    muteBtn.textContent = actions.muted ? "mic_off" : "mic";
    muteBtn.classList.toggle("is-off", actions.muted);
    muteBtn.setAttribute("aria-label", actions.muted ? "Ativar microfone" : "Silenciar microfone");
    deafenBtn.textContent = actions.deafened ? "headset_off" : "headset";
    deafenBtn.classList.toggle("is-off", actions.deafened);
    deafenBtn.setAttribute(
      "aria-label",
      actions.deafened ? "Ativar áudio" : "Ensurdecer"
    );
    dock.hidden = false;
    const box = sidebar.getBoundingClientRect();
    dock.style.left = `${Math.round(box.left)}px`;
    dock.style.width = `${Math.round(box.width)}px`;
    dock.style.bottom = `${Math.max(0, Math.round(innerHeight - box.bottom))}px`;
    if (dockPadded && dockPadded !== sidebar) {
      dockPadded.style.paddingBottom = "";
    }
    sidebar.style.paddingBottom = `${dock.offsetHeight}px`;
    dockPadded = sidebar;
  }

  function serverIdFromUrl() {
    const match = location.pathname.match(/\/server\/([0-9A-HJKMNP-TV-Z]{26})/i);
    return match ? match[1] : "";
  }

  function findKickButton() {
    for (const el of document.querySelectorAll("button, [role='button']")) {
      const label = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!/kick member/i.test(label) || label.length > 48) continue;
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) return el;
    }
    return null;
  }

  function menuRootFrom(el) {
    let cur = el;
    for (let i = 0; i < 14 && cur; i++) {
      const text = cur.textContent || "";
      if (/kick member/i.test(text) && /volume/i.test(text)) return cur;
      cur = cur.parentElement;
    }
    return el.parentElement || document.body;
  }

  async function captureUserId(menu) {
    const named = usersByName.get(pendingMenuUser.toLowerCase());
    if (named) return named;
    const copy = [...menu.querySelectorAll("button, [role='button']")].find((el) =>
      (el.textContent || "").includes("Copy user ID")
    );
    if (!copy) return "";
    let captured = "";
    const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (text) => {
      captured = String(text || "");
      return orig(text);
    };
    try {
      copy.click();
      await Promise.resolve();
    } finally {
      navigator.clipboard.writeText = orig;
    }
    return ULID.test(captured) ? captured : "";
  }

  async function disconnectFromVoice(btn) {
    const serverId = serverIdFromUrl();
    const menu = menuRootFrom(btn);
    const userId = await captureUserId(menu);
    if (!serverId || !userId || !sessionToken) {
      btn.textContent = "Não deu para identificar o usuário";
      return;
    }
    btn.disabled = true;
    try {
      const res = await origFetch(`/api/servers/${serverId}/members/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Token": sessionToken,
        },
        body: JSON.stringify({ remove: ["VoiceChannel"] }),
      });
      if (res.ok) {
        btn.textContent = "Removido da call";
        return;
      }
      btn.textContent = res.status === 403 ? "Sem permissão" : "Não foi possível remover";
    } catch {
      btn.textContent = "Não foi possível remover";
    } finally {
      btn.disabled = false;
    }
  }

  function syncDisconnectItem() {
    const kick = findKickButton();
    const existing = document.getElementById("muchat-disconnect-voice");
    if (!kick) {
      if (existing) existing.remove();
      return;
    }
    const menu = menuRootFrom(kick);
    if (!(menu.textContent || "").includes("Volume")) {
      if (existing) existing.remove();
      return;
    }
    if (existing && menu.contains(existing)) return;
    if (existing) existing.remove();
    const item = document.createElement("button");
    item.type = "button";
    item.id = "muchat-disconnect-voice";
    item.className = "muchat-disconnect-voice";
    item.textContent = "Remover da call";
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      disconnectFromVoice(item);
    });
    kick.parentElement
      ? kick.parentElement.insertBefore(item, kick)
      : kick.before(item);
  }

  function closeScreenPicker() {
    const modal = document.getElementById("muchat-screen-picker");
    if (modal) modal.remove();
  }

  function showScreenPicker(sources) {
    closeScreenPicker();
    if (!Array.isArray(sources) || !sources.length) return;
    const screens = sources.filter((s) => s.isFullScreen);
    const windows = sources.filter((s) => !s.isFullScreen);
    const modal = document.createElement("div");
    modal.id = "muchat-screen-picker";
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        if (window.native) window.native.screenPickerCallback(-1, false);
        closeScreenPicker();
      }
    });

    function section(title, items) {
      if (!items.length) return "";
      return (
        `<h3>${title}</h3><div class="muchat-screen-picker__grid">` +
        items
          .map((source) => {
            const img = source.thumbnail || source.image;
            const media = img
              ? `<img src="${img}" alt="">`
              : `<div class="muchat-screen-picker__ph">Janela</div>`;
            const name = String(source.name || "Fonte")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;");
            return `<button type="button" class="muchat-screen-picker__item" data-idx="${source.idx}">${media}<span>${name}</span></button>`;
          })
          .join("") +
        "</div>"
      );
    }

    modal.innerHTML =
      '<div class="muchat-screen-picker__panel">' +
      "<h2>Compartilhar tela</h2>" +
      section("Telas", screens) +
      section("Janelas", windows) +
      '<button type="button" class="muchat-screen-picker__cancel">Cancelar</button>' +
      "</div>";
    modal.querySelector(".muchat-screen-picker__panel").addEventListener("click", (event) => {
      const item = event.target.closest("[data-idx]");
      if (item) {
        event.preventDefault();
        const idx = Number(item.getAttribute("data-idx"));
        if (window.native) window.native.screenPickerCallback(idx, false);
        closeScreenPicker();
        return;
      }
      if (event.target.closest(".muchat-screen-picker__cancel")) {
        event.preventDefault();
        if (window.native) window.native.screenPickerCallback(-1, false);
        closeScreenPicker();
      }
    });
    document.body.appendChild(modal);
  }

  function listenScreenPicker() {
    if (window.native && typeof window.native.onScreenPicker === "function") {
      window.native.onScreenPicker((sources) => {
        showScreenPicker(sources);
      });
      return;
    }
    if (!window.native || typeof window.native.onceScreenPicker !== "function") return;
    window.native.onceScreenPicker((sources) => {
      showScreenPicker(sources);
      listenScreenPicker();
    });
  }
  listenScreenPicker();

  function findJoinVoiceButton() {
    for (const el of document.querySelectorAll("button, [role='button']")) {
      const label = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!/join the voice channel|entrar no canal de voz/i.test(label)) continue;
      if (label.length > 64) continue;
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) return el;
    }
    return null;
  }

  function rowLooksLikeVoice(el) {
    if (!el || el.closest("#muchat-voice-dock, #muchat-screen-picker, #muchat-splash, #muchat-stage-handle")) {
      return false;
    }
    let hasHeadset = false;
    let hasHash = false;
    const nodes = el.querySelectorAll("*");
    const cap = Math.min(nodes.length, 80);
    for (let i = 0; i < cap; i++) {
      const n = nodes[i];
      if (n.childElementCount !== 0) continue;
      const t = (n.textContent || "").trim();
      if (t === "headset" || t === "headset_mic" || t === "volume_up") hasHeadset = true;
      if (t === "tag" || t === "#") hasHash = true;
    }
    return hasHeadset && !hasHash;
  }

  document.addEventListener(
    "click",
    (event) => {
      if (callActions()) return;
      let el = event.target instanceof Element ? event.target : null;
      let hit = false;
      for (let i = 0; i < 10 && el; i++) {
        if (rowLooksLikeVoice(el)) {
          const box = el.getBoundingClientRect();
          if (box.width > 80 && box.width < 420) {
            hit = true;
            break;
          }
        }
        el = el.parentElement;
      }
      if (!hit) return;
      window.setTimeout(() => {
        if (callActions()) return;
        const join = findJoinVoiceButton();
        if (join) join.click();
      }, 300);
    },
    true
  );

  function startVoiceStageOnce() {
    if (voiceStageStarted) return;
    voiceStageStarted = true;
    window.addEventListener("resize", syncVoiceStage);
    document.addEventListener("fullscreenchange", syncVoiceStage);
    setInterval(() => {
      try {
        syncVoiceStage();
        syncVoiceDock();
        syncDisconnectItem();
      } catch {
        /* never block the chat */
      }
    }, 400);
    try {
      syncVoiceStage();
      syncVoiceDock();
      syncDisconnectItem();
    } catch {
      /* ignore */
    }
  }
})();
