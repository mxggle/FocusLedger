import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, resolveTheme } from "./theme";

/** A controllable `prefers-color-scheme` so "system" can be steered in tests. */
function stubColorScheme(dark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn)
  };
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  return {
    listenerCount: () => listeners.size,
    setDark(next: boolean) {
      media.matches = next;
      listeners.forEach((fn) => fn());
    }
  };
}

const isDark = () => document.documentElement.classList.contains("dark");

describe("theme", () => {
  beforeEach(() => document.documentElement.classList.remove("dark"));
  afterEach(() => vi.unstubAllGlobals());

  it("resolves 'system' against the OS and honors an explicit choice", () => {
    stubColorScheme(true);
    expect(resolveTheme("system")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    stubColorScheme(false);
    expect(resolveTheme("system")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("applies an explicit theme regardless of the OS appearance", () => {
    stubColorScheme(true);
    applyTheme("light");
    expect(isDark()).toBe(false);
    applyTheme("dark");
    expect(isDark()).toBe(true);
  });

  // The bug this guards: reading `matches` once left "System" stuck on the
  // appearance the app happened to start in.
  it("keeps following the OS while the setting is 'system'", () => {
    const os = stubColorScheme(false);
    const stop = applyTheme("system");
    expect(isDark()).toBe(false);

    os.setDark(true);
    expect(isDark()).toBe(true);

    os.setDark(false);
    expect(isDark()).toBe(false);

    stop();
    expect(os.listenerCount()).toBe(0);
  });

  it("does not listen to the OS once a theme is pinned", () => {
    const os = stubColorScheme(false);
    applyTheme("dark");
    expect(os.listenerCount()).toBe(0);

    os.setDark(true);
    expect(isDark()).toBe(true);
  });
});
