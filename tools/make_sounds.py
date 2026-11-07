"""Makes Cody's own sounds (web/sounds/*.wav) from nothing but math: no samples, no recordings, no third-party audio.
They are part of this repository (MIT, like the code). Run it again to remake them; the output is the same every time
(fixed random seed).

    python tools/make_sounds.py

Cody's timbre: a soft square-ish voice (a few odd harmonics) through two vowel-like resonances, with a quick vibrato,
so it chirps rather than talks. The chatter is a set of short syllables the page strings together, in the rhythm of
the text, while the caption shows.

    chatter-01..12  syllables          thinking   soft "hmm-hmm"        done      happy rising run
    error           two falling bloops calling    "hey, over here"       alarm     bright ring, three times
    hop             springy boing      pet        contented coo          startle   quick squeak
    yawn            long falling glide snore      slow rumble in and out
"""
from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

RATE = 16000
OUT = Path(__file__).resolve().parent.parent / "web" / "sounds"
TAU = 2 * math.pi


def envelope(i: int, n: int, attack: float = 0.01, release: float = 0.05) -> float:
    a, r = max(1, int(attack * RATE)), max(1, int(release * RATE))
    if i < a:
        return i / a
    if i > n - r:
        return max(0.0, (n - i) / r)
    return 1.0


def voice(freqs, seconds: float, vowel=(700, 1200), vibrato: float = 0.03, level: float = 0.5,
          attack: float = 0.01, release: float = 0.06, harmonics: int = 7) -> list[float]:
    """A pitched voice following `freqs` (a function of time 0..1), shaped by two resonances (`vowel`)."""
    n = int(seconds * RATE)
    out, phase = [], 0.0
    for i in range(n):
        t = i / n
        f = freqs(t) * (1 + vibrato * math.sin(TAU * 6.5 * i / RATE))
        phase += TAU * f / RATE
        sample = 0.0
        for k in range(1, harmonics + 1, 2):                      # odd harmonics: a soft square
            hf = k * f
            gain = sum(1 / (1 + ((hf - v) / (0.18 * v)) ** 2) for v in vowel) + 0.15
            sample += math.sin(k * phase) * gain / k
        out.append(sample * level * envelope(i, n, attack, release))
    return normalize(out, level)


def normalize(samples: list[float], peak: float) -> list[float]:
    top = max(1e-9, max(abs(s) for s in samples))
    return [s * peak / top for s in samples]


def silence(seconds: float) -> list[float]:
    return [0.0] * int(seconds * RATE)


def glide(a: float, b: float):
    return lambda t: a * (b / a) ** t


def noise(seconds: float, level: float, rng: random.Random, color: float = 0.9) -> list[float]:
    out, last = [], 0.0
    n = int(seconds * RATE)
    for i in range(n):
        last = color * last + (1 - color) * rng.uniform(-1, 1)
        out.append(last * level * envelope(i, n, 0.2, 0.3))
    return normalize(out, level) if n else out


def mix(*parts: list[float]) -> list[float]:
    n = max(len(p) for p in parts)
    return [sum(p[i] for p in parts if i < len(p)) for i in range(n)]


def save(name: str, samples: list[float]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32000)) for s in samples))


VOWELS = [(800, 1200), (400, 2000), (600, 1000), (300, 2300), (500, 900), (700, 1700)]


def chatter(rng: random.Random) -> dict[str, list[float]]:
    sounds = {}
    for i in range(12):
        base = rng.uniform(330, 520)
        bend = rng.uniform(0.85, 1.25)
        sounds[f"chatter-{i + 1:02d}"] = voice(glide(base, base * bend), rng.uniform(0.07, 0.12),
                                               vowel=VOWELS[i % len(VOWELS)], vibrato=0.02, level=0.45,
                                               attack=0.006, release=0.03)
    return sounds


def rap(rng: random.Random) -> list[float]:
    return mix(noise(0.02, 0.6, rng, color=0.5),
               voice(glide(260, 150), 0.07, vowel=(220, 600), level=0.55, attack=0.002, release=0.05, harmonics=4))


def effects(rng: random.Random) -> dict[str, list[float]]:
    hm = voice(lambda t: 260 + 30 * math.sin(TAU * t), 0.22, vowel=(300, 900), level=0.3, attack=0.04, release=0.08)
    run = []
    for f in (523, 659, 784, 1047):
        run += voice(lambda t, f=f: f, 0.09, vowel=(900, 2200), level=0.45, release=0.04)
    calling = (voice(glide(420, 640), 0.16, vowel=(700, 1300), level=0.5) + silence(0.06)
               + voice(glide(560, 700), 0.24, vowel=(500, 1800), level=0.55))
    ring = []
    for _ in range(3):
        ring += mix(voice(lambda t: 1320, 0.12, vowel=(1300, 2600), level=0.4, harmonics=3),
                    voice(lambda t: 1760, 0.12, vowel=(1700, 3000), level=0.25, harmonics=3)) + silence(0.08)
    return {
        "thinking": hm + silence(0.08) + voice(lambda t: 240 + 25 * math.sin(TAU * t), 0.26, vowel=(300, 900),
                                               level=0.28, attack=0.04, release=0.1),
        "done": run + voice(lambda t: 1047, 0.2, vowel=(900, 2200), level=0.4, release=0.15),
        "error": voice(glide(420, 300), 0.16, vowel=(500, 800), level=0.45) + silence(0.04)
        + voice(glide(330, 200), 0.24, vowel=(400, 700), level=0.45),
        "calling": calling,
        "alarm": ring,
        "hop": voice(lambda t: 300 * (1 + 1.4 * t) * (1 + 0.15 * math.sin(TAU * 9 * t)), 0.22, vowel=(600, 1500),
                     vibrato=0.0, level=0.45),
        "pet": voice(lambda t: 380 + 40 * math.sin(TAU * 2 * t), 0.45, vowel=(350, 1000), vibrato=0.06, level=0.35,
                     attack=0.05, release=0.15),
        "startle": voice(glide(500, 1400), 0.12, vowel=(1000, 2500), level=0.5, attack=0.003),
        "yawn": voice(glide(520, 210), 1.1, vowel=(750, 1100), vibrato=0.015, level=0.4, attack=0.15, release=0.35),
        "snore": mix(noise(0.9, 0.25, rng), voice(lambda t: 90 + 15 * math.sin(math.pi * t), 0.9, vowel=(250, 600),
                                                  level=0.25, attack=0.3, release=0.4, harmonics=5))
        + silence(0.3) + noise(0.6, 0.12, rng, color=0.95),
        # a camera shutter: two short clicks, the second one softer (the quick screenshot, "Cody, take a screenshot")
        "snap": noise(0.025, 0.7, rng, color=0.3) + silence(0.07) + noise(0.02, 0.45, rng, color=0.4),
        # knocking on the screen: two knuckle raps on glass, each a click with a short low thump under it
        "knock": rap(rng) + silence(0.13) + rap(rng),
    }


def main() -> None:
    rng = random.Random(7420)
    sounds = {**chatter(rng), **effects(rng)}
    for name, samples in sounds.items():
        save(name, samples)
    total = sum((OUT / f"{name}.wav").stat().st_size for name in sounds)
    print(f"{len(sounds)} sounds in {OUT} ({total // 1024} KB)")


if __name__ == "__main__":
    main()
