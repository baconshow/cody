// shake.js — the phone being shaken: from the accelerometer (the devicemotion event), tells when the device is
// being shaken, so the mascot grabs the edges of the screen (animator.setGrab). A shake = SHAKE.peaks jolts above
// SHAKE.force within SHAKE.window; it lets go SHAKE.release after the last jolt. On an iPhone the sensor asks for
// permission on a tap (wireShake, in main.js); without a sensor, nothing happens.
//
//   shakeForce(event) → m/s² without gravity: the larger of the pure acceleration (acceleration) and how far the
//     acceleration with gravity strays from g (|accelerationIncludingGravity| − g). Some Androids send the pure one
//     zeroed or empty
//   createShake({ onChange, clock }) → { measure(force) }   onChange(grabbing) when it starts and when it ends

// the first threshold (14 m/s², 3 in 0.9 s) missed an ordinary shake, which reads 8 to 15.
// The sensor sends about 60 events a second: one jolt lasts several readings and counts once (gap)
export const SHAKE = Object.freeze({ force: 9, peaks: 3, window: 1100, gap: 150, release: 1200, gravity: 9.81 });

const valid = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

export function shakeForce(e) {
  const a = e?.acceleration;
  const g = e?.accelerationIncludingGravity;
  const pure = valid(a) ? Math.hypot(a.x, a.y, a.z) : 0;
  const withGravity = valid(g) ? Math.abs(Math.hypot(g.x, g.y, g.z) - SHAKE.gravity) : 0;
  return Math.max(pure, withGravity);
}

export function createShake({ onChange, clock = () => performance.now() }) {
  const st = { peaks: [], grabbing: false, last: -Infinity };
  return {
    measure(force) {
      const now = clock();
      const lastPeak = st.peaks[st.peaks.length - 1] ?? -Infinity;
      if (force > SHAKE.force && now - lastPeak >= SHAKE.gap) st.peaks.push(now);
      while (st.peaks.length && now - st.peaks[0] > SHAKE.window) st.peaks.shift();
      if (st.peaks.length >= SHAKE.peaks) {
        st.last = now;
        if (!st.grabbing) { st.grabbing = true; onChange(true); }
      } else if (st.grabbing && now - st.last > SHAKE.release) {
        st.grabbing = false;
        onChange(false);
      }
    },
  };
}
