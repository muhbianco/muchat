"""Gera blips WAV curtos para os eventos de voz (os ogg do Stoat são placeholders vazios)."""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

RATE = 22050


def _tone(freq: float, ms: int, volume: float = 0.22) -> list[int]:
    n = int(RATE * ms / 1000)
    samples: list[int] = []
    for i in range(n):
        t = i / RATE
        fade = min(i, n - 1 - i, int(RATE * 0.008)) / max(1, int(RATE * 0.008))
        val = math.sin(2 * math.pi * freq * t) * volume * fade
        samples.append(int(max(-1, min(1, val)) * 32767))
    return samples


def _silence(ms: int) -> list[int]:
    return [0] * int(RATE * ms / 1000)


def _write(path: Path, samples: list[int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(b"".join(struct.pack("<h", s) for s in samples))


SOUNDS: dict[str, list[int]] = {
    "mute": _tone(420, 70) + _silence(30) + _tone(280, 90),
    "unmute": _tone(280, 70) + _silence(30) + _tone(420, 90),
    "deafen": _tone(220, 140, 0.28),
    "undeafen": _tone(520, 120, 0.2),
    "userJoinVoice": _tone(440, 60) + _tone(554, 60) + _tone(659, 80),
    "userLeaveVoice": _tone(659, 60) + _tone(554, 60) + _tone(440, 80),
    "userMoved": _tone(494, 80) + _silence(20) + _tone(494, 50),
    "streamStart": _tone(523, 50) + _tone(659, 50) + _tone(784, 90),
    "streamEnd": _tone(784, 50) + _tone(659, 50) + _tone(523, 90),
    "streamViewerJoin": _tone(392, 50) + _tone(523, 80),
    "streamViewerLeave": _tone(523, 50) + _tone(392, 80),
    "ringtoneIncoming": (_tone(880, 90) + _silence(80)) * 2,
    "ringtoneOutgoing": (_tone(660, 70) + _silence(50)) * 2,
    "event": _tone(500, 90) + _silence(20) + _tone(500, 70),
}


def main() -> None:
    root = Path(__file__).resolve().parent / "public" / "sounds"
    for name, samples in SOUNDS.items():
        _write(root / f"{name}.wav", samples)
    print(f"wrote {len(SOUNDS)} wavs in {root}")


if __name__ == "__main__":
    main()
