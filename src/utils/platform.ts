/**
 * Platform + window-material detection.
 *
 * Yolo ships one webview bundle to macOS and Windows, and the two OSes
 * disagree about almost everything the *window* does: where its buttons live,
 * whether the app draws them, and what kind of translucent material sits
 * behind the webview. This module is the single place that answers those
 * questions, so components can branch on intent ("does the app draw its own
 * caption buttons?") rather than on `navigator.platform`.
 *
 * Detection is synchronous and computed once at module load, so it is safe to
 * read directly during render. The *material* has a second, async step: only
 * the Rust side knows whether applying vibrancy/Mica actually succeeded, so
 * `syncWindowMaterial()` corrects the optimistic guess after startup.
 */

export type Platform = "mac" | "windows" | "linux";

/**
 * The translucent material behind the webview, as actually applied.
 *
 * - `vibrancy` — macOS NSVisualEffectView (`UnderWindowBackground`).
 * - `mica`     — Windows 11 Mica.
 * - `acrylic`  — Windows 10 / Mica fallback.
 * - `none`     — no material: browser dev server, Linux, older Windows, or a
 *                failed apply. Chrome surfaces render opaque instead.
 */
export type WindowMaterial = "vibrancy" | "mica" | "acrylic" | "none";

/**
 * Classify a platform from the two strings a webview will give us.
 *
 * WebView2 exposes `navigator.userAgentData.platform` ("Windows"); WKWebView
 * does not, so `navigator.platform` ("MacIntel") is the fallback. Exported
 * pure so it can be tested without stubbing globals.
 */
export function resolvePlatform(
  uaDataPlatform: string | undefined,
  navigatorPlatform: string | undefined
): Platform {
  const hint = `${uaDataPlatform ?? ""} ${navigatorPlatform ?? ""}`.toUpperCase();
  if (hint.includes("MAC")) return "mac";
  if (hint.includes("WIN")) return "windows";
  return "linux";
}

type UaDataCarrier = Navigator & { userAgentData?: { platform?: string } };

/**
 * Dev-only escape hatch: `?platform=windows` / `?material=mica`.
 *
 * The shell is the one part of Yolo that renders differently per OS, and it is
 * also the part hardest to check — you cannot see the Windows title bar from a
 * Mac. These parameters let the dev server render any platform's chrome, so a
 * change to the frame can be reviewed on both before it ships.
 *
 * Stripped from production builds: `import.meta.env.DEV` is statically false
 * there, so the whole branch is dead code the bundler drops.
 */
function devOverride<T extends string>(
  key: string,
  allowed: readonly T[]
): T | undefined {
  if (!import.meta.env.DEV) return undefined;
  if (typeof window === "undefined") return undefined;
  try {
    const value = new URLSearchParams(window.location.search).get(key);
    return allowed.find((candidate) => candidate === value);
  } catch {
    return undefined;
  }
}

function detectPlatform(): Platform {
  const override = devOverride("platform", ["mac", "windows", "linux"] as const);
  if (override) return override;
  if (typeof navigator === "undefined") return "linux";
  const uaData = (navigator as UaDataCarrier).userAgentData?.platform;
  return resolvePlatform(uaData, navigator.platform);
}

export const platform: Platform = detectPlatform();

export const isMac = platform === "mac";
export const isWindows = platform === "windows";
export const isLinux = platform === "linux";

export const isTauriRuntime =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Whether the app draws its own minimize/maximize/close buttons.
 *
 * macOS keeps its native traffic lights (repositioned into our title bar by
 * `position_traffic_lights` in `src-tauri/src/lib.rs`), so only Windows needs
 * web-drawn caption buttons — see `WindowControls`. Never true in a browser,
 * where the real browser chrome is already there.
 */
export const usesCustomWindowControls =
  isWindows && (isTauriRuntime || import.meta.env.DEV);

/**
 * Whether the OS reserves space at the window's top-*left* for its own buttons.
 * Drives the title bar's leading inset on macOS.
 */
export const hasNativeTrafficLights =
  isMac && (isTauriRuntime || import.meta.env.DEV);

/**
 * The material we *expect* before Rust confirms. Used for the first paint so
 * the shell doesn't flash opaque-then-glass; `syncWindowMaterial()` replaces it
 * with the truth a tick later.
 */
function optimisticMaterial(): WindowMaterial {
  const override = devOverride("material", [
    "vibrancy",
    "mica",
    "acrylic",
    "none"
  ] as const);
  if (override) return override;
  if (!isTauriRuntime) return "none";
  if (isMac) return "vibrancy";
  if (isWindows) return "mica";
  return "none";
}

const MATERIALS: ReadonlySet<string> = new Set([
  "vibrancy",
  "mica",
  "acrylic",
  "none"
]);

/**
 * Publish the platform and its material to CSS as
 * `<html data-platform="…" data-material="…">`.
 *
 * Everything platform-conditional in `src/styles.css` keys off these two
 * attributes rather than duplicating detection, so there is exactly one source
 * of truth and no flash of the wrong chrome.
 */
export function markPlatform(material: WindowMaterial = optimisticMaterial()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-platform", platform);
  root.setAttribute("data-material", material);
}

/**
 * Ask Rust which material actually got applied and re-publish it.
 *
 * Applying a material can fail for real reasons — Windows 10 has no Mica, a
 * user can disable transparency system-wide, a compositor can refuse — and the
 * glass surfaces must fall back to opaque when it does. Fails soft: on any
 * error the optimistic value stands, which is the pre-existing behavior.
 */
export async function syncWindowMaterial(): Promise<WindowMaterial> {
  const guess = optimisticMaterial();
  if (!isTauriRuntime) {
    markPlatform(guess);
    return guess;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const applied = await invoke<string>("window_material");
    const material = (MATERIALS.has(applied) ? applied : "none") as WindowMaterial;
    markPlatform(material);
    return material;
  } catch {
    markPlatform(guess);
    return guess;
  }
}
