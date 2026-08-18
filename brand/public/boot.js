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

  const voiceMo = new MutationObserver(() => syncVoiceStage());
  const startVoiceStage = () => {
    const host = document.getElementById("floating") || document.body;
    voiceMo.observe(host, { childList: true, subtree: true });
    window.addEventListener("resize", syncVoiceStage);
    document.addEventListener("fullscreenchange", syncVoiceStage);
    setInterval(syncVoiceStage, 400);
    syncVoiceStage();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startVoiceStage);
  } else {
    startVoiceStage();
  }
})();
