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

  // Palco de voz: preenche a coluna central e esconde o chat de texto.
  const VOICE_STAGE = "muchat-voice-stage";
  let shareAutoFocused = false;

  function floatingLayer() {
    return document.querySelector("#floating > div");
  }

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

  function syncVoiceStage() {
    const root = document.documentElement;
    const layer = floatingLayer();
    if (!layer || document.fullscreenElement) {
      root.classList.remove(VOICE_STAGE);
      shareAutoFocused = false;
      return;
    }
    const pip = getComputedStyle(layer).getPropertyValue("--flt-w").trim();
    const box = layer.getBoundingClientRect();
    const docked =
      !pip &&
      box.width >= 400 &&
      box.left < innerWidth - 80 &&
      box.top < innerHeight - 120 &&
      box.height >= 80;
    if (!docked) {
      root.classList.remove(VOICE_STAGE);
      shareAutoFocused = false;
      return;
    }
    root.style.setProperty(
      "--muchat-voice-top",
      `${Math.max(0, Math.round(box.top))}px`
    );
    root.classList.add(VOICE_STAGE);
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
    const floating = document.getElementById("floating");
    const end = iconButton(floating, ["call_end"]);
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

  const voiceMo = new MutationObserver(() => syncVoiceStage());
  const startVoiceStage = () => {
    const host = document.getElementById("floating") || document.body;
    voiceMo.observe(host, { childList: true, subtree: true });
    window.addEventListener("resize", syncVoiceStage);
    document.addEventListener("fullscreenchange", syncVoiceStage);
    setInterval(() => {
      syncVoiceStage();
      syncVoiceDock();
      syncDisconnectItem();
    }, 400);
    syncVoiceStage();
    syncVoiceDock();
    syncDisconnectItem();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startVoiceStage);
  } else {
    startVoiceStage();
  }
})();
