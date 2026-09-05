import { describe, expect, it } from "vitest";
import { resolvePlatform } from "./platform";

describe("resolvePlatform", () => {
  it("reads WebView2's userAgentData hint", () => {
    expect(resolvePlatform("Windows", undefined)).toBe("windows");
  });

  it("falls back to navigator.platform on WKWebView, which has no userAgentData", () => {
    expect(resolvePlatform(undefined, "MacIntel")).toBe("mac");
    expect(resolvePlatform(undefined, "Win32")).toBe("windows");
  });

  it("treats anything unrecognized as linux", () => {
    expect(resolvePlatform(undefined, undefined)).toBe("linux");
    expect(resolvePlatform("Linux", "X11")).toBe("linux");
  });

  it("is case-insensitive", () => {
    expect(resolvePlatform("windows", "win32")).toBe("windows");
    expect(resolvePlatform("macOS", "macintel")).toBe("mac");
  });
});
