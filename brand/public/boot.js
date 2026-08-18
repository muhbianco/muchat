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
})();
