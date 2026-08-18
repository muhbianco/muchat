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

  // Stoat empacota mute/call/stream como ogg vazio (data URI). Só message_sound é arquivo de verdade.
  let pendingSound = "";
  const origBind = Function.prototype.bind;
  Function.prototype.bind = function bindPatched(...args) {
    const bound = origBind.apply(this, args);
    if (!isPlaySoundFn(this)) return bound;
    return function playSoundPatched(sound, force) {
      if (typeof sound === "string") pendingSound = sound;
      return bound.apply(this, arguments);
    };
  };

  const NativeAudio = window.Audio;
  window.Audio = new Proxy(NativeAudio, {
    construct(target, args) {
      let src = args[0];
      if (typeof src === "string" && src.startsWith("data:audio")) {
        src = SOUND_FILES[pendingSound] || FALLBACK_SOUND;
        pendingSound = "";
      }
      return new target(src);
    },
  });

  function isPlaySoundFn(fn) {
    if (!fn || typeof fn !== "function") return false;
    if (fn.name === "playSound") return true;
    const text = Function.prototype.toString.call(fn);
    return text.includes('case"mute"') && text.includes("new Audio");
  }
})();
