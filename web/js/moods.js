// moods.js — the face's seven moods and what each one asks of the springs.
//
// The expression targets are the ones from the FaceAnimator of the open-source Bluey app (public domain), under
// the same names: listening, talking, pointing, thinking, happy, resting, sleepy.
// pupil: scales the eye size · browRaise: brow height, in Bluey drawing px (+ raises) ·
// browTilt: brow angle, in radians (+ curious, − focused) · blush: 0 to 1 · squint: the cheeks push up (happy).
//
// The arms belong to the mascot (Bluey has none): raiseL and raiseR from 0 (hanging) to 1 (straight up); stretch,
// only on the arm on the side it is looking toward, from 0 to 1 (horizontal, pointing).

export const MOODS = Object.freeze(['listening', 'talking', 'pointing', 'thinking', 'happy', 'resting', 'sleepy']);

export const EXPRESSION = Object.freeze({
  listening: Object.freeze({ pupil: 1.12, browRaise: 10, browTilt: 0, blush: 0.25, squint: 0 }),
  talking: Object.freeze({ pupil: 1.05, browRaise: 6, browTilt: 0, blush: 0.25, squint: 0 }),   // + talk × 18; wobbles
  pointing: Object.freeze({ pupil: 0.95, browRaise: -4, browTilt: -0.14, blush: 0.25, squint: 0 }),
  thinking: Object.freeze({ pupil: 0.9, browRaise: 4, browTilt: 0.22, blush: 0.25, squint: 0 }),
  happy: Object.freeze({ pupil: 1.2, browRaise: 16, browTilt: 0, blush: 0.85, squint: 1 }),
  resting: Object.freeze({ pupil: 0.9, browRaise: -8, browTilt: 0, blush: 0.15, squint: 0 }),
  sleepy: Object.freeze({ pupil: 0.88, browRaise: -10, browTilt: 0.12, blush: 0.15, squint: 0 }),
});

export const ARMS = Object.freeze({
  listening: Object.freeze({ raiseL: 0.08, raiseR: 0.08, stretch: 0 }),
  talking: Object.freeze({ raiseL: 0.15, raiseR: 0.15, stretch: 0 }),      // + the gesture, alternating, with speech
  pointing: Object.freeze({ raiseL: 0.2, raiseR: 0.2, stretch: 1 }),       // the other arm hangs loose
  thinking: Object.freeze({ raiseL: 0.42, raiseR: 0, stretch: 0 }),
  happy: Object.freeze({ raiseL: 0.85, raiseR: 0.85, stretch: 0 }),
  resting: Object.freeze({ raiseL: -0.1, raiseR: -0.1, stretch: 0 }),
  sleepy: Object.freeze({ raiseL: -0.1, raiseR: -0.1, stretch: 0 }),
});

// eyes closed or nearly so: no idle hop, no startle on a mood change
export const SLEEPING = Object.freeze(new Set(['resting', 'sleepy']));

export const validMood = (name) => (MOODS.includes(name) ? name : null);
