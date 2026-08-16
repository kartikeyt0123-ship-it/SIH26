/**
 * The Rachna motion system.
 *
 * Three rules, enforced by using only these tokens:
 *
 * 1. Motion explains state change. If nothing changed, nothing moves.
 * 2. Everything decelerates. Content enters on an expo/quart out curve and
 *    never bounces — bounce reads as toy, and this is a tool dealers use
 *    at a counter with a customer waiting.
 * 3. Distance scales with duration. A 12px nudge is fast; a full-section
 *    reveal is slow. Nothing travels far AND slow — that reads as lag.
 */

export const EASE = {
  outQuart: [0.165, 0.84, 0.44, 1] as const,
  outExpo: [0.16, 1, 0.3, 1] as const,
  inOutQuint: [0.83, 0, 0.17, 1] as const,
  spring: [0.34, 1.4, 0.64, 1] as const,
};

/** GSAP-formatted equivalents of the same curves. */
export const GSAP_EASE = {
  outQuart: "power4.out",
  outExpo: "expo.out",
  inOutQuint: "expo.inOut",
};

export const DUR = {
  fast: 0.18,
  base: 0.32,
  slow: 0.62,
  cinema: 1.1,
};

/** Stagger presets. Anything above 90ms starts to feel like a queue, not a group. */
export const STAGGER = {
  tight: 0.035,
  base: 0.06,
  loose: 0.09,
};

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
