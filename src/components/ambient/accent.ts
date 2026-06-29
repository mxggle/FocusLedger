import type { CSSProperties } from "react";
import { getScene } from "./scenes/registry";

/**
 * Inline style that scopes the focus chrome's accent to the active scene.
 *
 * Setting `--focus-accent` on the focus stage root cascades to the ring,
 * controls, status dot, and aura — so they adopt the scene's color (warm amber
 * for fire, misted blue for rain, teal for river) instead of the fixed brand
 * cobalt. When no scene is active, we set nothing and the global default
 * (`--focus-accent: var(--primary)` in styles.css) keeps the original look.
 *
 * Scoping via a CSS variable — rather than touching `--primary` — keeps the rest
 * of the app (sidebar, settings, dialogs) on the brand accent untouched.
 */
export function focusAccentStyle(sceneId: string): CSSProperties {
  const accent = getScene(sceneId)?.accent;
  return accent ? ({ "--focus-accent": accent } as CSSProperties) : {};
}

/**
 * The rest screen's signature color — a calm moonlit indigo, deliberately apart
 * from every working scene accent (amber/blue/teal) so rest never reads as
 * "more work". An HSL triple so it drives `hsl(var(--focus-accent))` and composes
 * with alpha, exactly like the scene accents.
 */
export const REST_ACCENT = "236 44% 66%";

/** Scopes the rest chrome (ring, controls, aura) to {@link REST_ACCENT}. */
export function restAccentStyle(): CSSProperties {
  return { "--focus-accent": REST_ACCENT } as CSSProperties;
}
