// spring.js — the damped spring that brings every part of the face to life. Ported from the FaceAnimator of the
// open-source Bluey app (bluey-by-riley, public domain, Unlicense): the same math, just translated to JavaScript.
//
//   createSpring(value, stiffness, damping) → { value, velocity, stiffness, damping }
//     damping 1 reaches the target without overshooting; below 1 it overshoots and comes back (lower = bouncier)
//   stepSpring(spring, target, dt) → the new value. Semi-implicit Euler: velocity first, then position.
//   settleSpring(spring, target) → the value, already on the target and at rest ("reduce motion")
//
// The spring is mutated in place on purpose: the face runs 60 times a second and nothing is allocated per frame.

export function createSpring(value, stiffness = 200, damping = 0.7) {
  return { value, velocity: 0, stiffness, damping };
}

export function stepSpring(spring, target, dt) {
  const friction = 2 * Math.sqrt(spring.stiffness) * spring.damping;
  spring.velocity += (spring.stiffness * (target - spring.value) - friction * spring.velocity) * dt;
  spring.value += spring.velocity * dt;
  return spring.value;
}

export function settleSpring(spring, target) {
  spring.value = target;
  spring.velocity = 0;
  return target;
}
