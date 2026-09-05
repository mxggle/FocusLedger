import type { AppTheme } from "../types";
import { isTauriRuntime } from "./platform";

/**
 * Theme application.
 *
 * A theme has to land in two places, and forgetting either one is what makes a
 * desktop app look half-dressed:
 *
 *   1. The web layer — the `.dark` class on <html>, which every design token
 *      in `src/styles.css` keys off.
 *   2. The *window* — macOS decides the appearance of everything AppKit draws
 *      (the `UnderWindowBackground` vibrancy behind the title bar and sidebar,
 *      the traffic lights, native menus and scrollbars) from the window's own
 *      appearance, not from anything CSS says. Left alone it follows the OS,
 *      so picking Dark in a light system left the material milky-light behind
 *      a dark UI — the frame and the content disagreeing about the theme.
 *
 * `setTheme(null)` hands the window back to the OS, which is exactly what the
 * "System" setting means.
 */

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(DARK_QUERY).matches;
}

/** The theme actually painted, once "system" is resolved against the OS. */
export function resolveTheme(theme: AppTheme): "light" | "dark" {
  if (theme === "system") return prefersDark() ? "dark" : "light";
  return theme;
}

/** Push the resolved theme to the window material and native chrome. */
async function applyNativeTheme(theme: AppTheme): Promise<void> {
  if (!isTauriRuntime) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    // null = follow the system, which is what "system" asks for.
    await getCurrentWindow().setTheme(theme === "system" ? null : theme);
  } catch {
    // Older webviews and unsupported platforms simply keep the OS appearance;
    // the CSS theme below still applies, so this is cosmetic, not fatal.
  }
}

/**
 * Apply `theme` everywhere and keep it applied.
 *
 * Returns a cleanup that drops the OS listener. The listener is what makes
 * "System" live: `matchMedia(...).matches` read once only tells you the
 * appearance at that instant, so without it the app stayed light until
 * something else happened to re-render the effect.
 */
export function applyTheme(theme: AppTheme): () => void {
  const root = document.documentElement;
  const paint = () => root.classList.toggle("dark", resolveTheme(theme) === "dark");

  paint();
  void applyNativeTheme(theme);

  if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }

  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", paint);
  return () => media.removeEventListener("change", paint);
}
