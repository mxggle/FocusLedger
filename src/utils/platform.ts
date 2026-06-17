/**
 * Lightweight, render-safe platform detection.
 *
 * We deliberately read `navigator.platform` (synchronously available) rather
 * than Tauri's async `os` plugin so it can be used directly in component
 * render without an effect. The value never changes during a session, so it is
 * computed once at module load.
 */
export const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().includes("MAC");
