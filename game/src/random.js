// A tiny seeded random generator (mulberry32) so the city, traffic and screenshot
// scenes are identical on every load: same seed, same Solmarina.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) { return min + rng() * (max - min); }
export function randInt(rng, min, max) { return Math.floor(randRange(rng, min, max + 1)); }
export function pick(rng, list) { return list[Math.floor(rng() * list.length) % list.length]; }
/** A coin flip that lands true with probability p — the chat stops, the odd
 *  empty lot and every other small behavioural dice roll in the city. */
export function chance(rng, p) { return rng() < p; }
/** -1 or +1 with equal odds, for choosing a side without a second roll. */
export function randSign(rng) { return rng() < 0.5 ? -1 : 1; }
export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
/** Shortest-path angle interpolation, for steering and cameras. */
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
/** Frame-rate independent exponential approach: glides a value toward its
 *  target with time constant 1/lambda — the helicopter's hover uses it so it
 *  banks in smoothly instead of teleporting after the player. */
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
/** Pick with per-item weights (traffic model variety: exotics stay rare). */
export function weightedPick(rng, list, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let roll = rng() * total;
  for (let i = 0; i < list.length; i++) { roll -= weights[i]; if (roll <= 0) return list[i]; }
  return list[list.length - 1];
}
/** Fisher–Yates shuffle in place, driven by the seeded rng. */
export function shuffle(rng, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
