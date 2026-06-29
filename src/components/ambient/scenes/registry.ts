import type { LucideIcon } from "lucide-react";
import { fireScene } from "./fire";
import { rainScene } from "./rain";
import { riverScene } from "./river";

export interface Size {
  /** Logical (CSS) pixels; the renderer has already scaled the context by dpr. */
  width: number;
  height: number;
}

/**
 * Per-theme color set. All values are `"r, g, b"` triplets (no alpha) so scenes
 * can compose them with `withAlpha(rgb, a)`. Keeping alpha out of the palette
 * lets each scene choose appropriate opacity per element.
 */
export interface ThemeColors {
  /** Full-bleed background wash. */
  base: string;
  /** Mid-tone for larger shapes / gradients. */
  mid: string;
  /** Particle / line color. */
  particle: string;
  /** Bright accent for glows and highlights. */
  glow: string;
}

/**
 * Light and dark palette variants. Resolved at draw time via `resolveColors()`
 * so a single mounted scene stays correct when the user switches themes live.
 */
export interface ScenePalette {
  dark: ThemeColors;
  light: ThemeColors;
}

/**
 * Returns the correct `ThemeColors` for the current UI theme by reading the
 * `dark` class on `<html>`. Call this at the top of every `draw` / `reducedFrame`
 * to ensure theme changes are reflected without requiring a remount.
 */
export function resolveColors(palette: ScenePalette): ThemeColors {
  const isDark = document.documentElement.classList.contains("dark");
  return isDark ? palette.dark : palette.light;
}

/** A live, per-instance scene renderer holding its own animation state. */
export interface AmbientScene {
  /** Render one animated frame. `t` is `performance.now()` in ms. */
  draw(ctx: CanvasRenderingContext2D, t: number, dpr: number, size: Size): void;
  /** A single static frame for reduced-motion (no RAF). */
  reducedFrame(ctx: CanvasRenderingContext2D, dpr: number, size: Size): void;
}

/**
 * A selectable scene. Adding one = create `scenes/<id>.ts` exporting an
 * `AmbientSceneDef` and append it to `SCENES`; the picker, renderer, and
 * settings type all derive from this list.
 */
export interface AmbientSceneDef {
  id: string;
  label: string;
  icon: LucideIcon;
  palette: ScenePalette;
  /**
   * Accent that the focus chrome (ring, controls, aura) adopts while this scene
   * is active — an HSL triple `"h s% l%"` so it can drive `hsl(var(--focus-accent))`
   * and compose with alpha. Tuned to sit *in* the scene (warm amber for fire,
   * misted blue for rain, teal for river) rather than fight it.
   */
  accent: string;
  /** Factory so each mounted canvas gets independent particle state. */
  create(palette: ScenePalette): AmbientScene;
}

export const SCENES: AmbientSceneDef[] = [rainScene, fireScene, riverScene];

export function getScene(id: string): AmbientSceneDef | undefined {
  return SCENES.find((scene) => scene.id === id);
}
