/**
 * Yolo motion language — two named primitives reused across the theme so the
 * app feels cohesive instead of like scattered effects.
 *
 * The asymmetry is the personality: calm settling on the way in, a single
 * joyful overshoot only when something is *earned*.
 *
 * Both respect `prefers-reduced-motion` at the component level (callers should
 * branch on framer-motion's `useReducedMotion`); these are just the curves.
 */
import type { Transition } from "framer-motion";

/** Rest / gravity — arrives and comes to rest. No overshoot. */
export const settle: Transition = {
  type: "tween",
  ease: [0.2, 0.8, 0.2, 1],
  duration: 0.36
};

/** Earned joy — one overshoot, brief. */
export const celebrate: Transition = {
  type: "tween",
  ease: [0.34, 1.56, 0.64, 1],
  duration: 0.6
};

/** How long the focus-complete celebration stays on screen, in ms. */
export const CELEBRATION_MS = 1800;
export const CELEBRATION_MS_REDUCED = 1300;

/** How long the commit whisper lingers before fading, in ms. */
export const COMMIT_WHISPER_MS = 3200;
