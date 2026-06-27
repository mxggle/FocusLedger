import { describe, expect, it } from "vitest";
import { deriveSessionTitle } from "./sessionTitle";

describe("deriveSessionTitle", () => {
  it("returns empty string for blank input", () => {
    expect(deriveSessionTitle("")).toBe("");
    expect(deriveSessionTitle(null)).toBe("");
    expect(deriveSessionTitle("   \n  ")).toBe("");
  });

  it("uses the first non-empty line and collapses whitespace", () => {
    expect(deriveSessionTitle("\n  plan   my\tday  \nmore")).toBe("plan my day");
  });

  it("truncates long titles with an ellipsis", () => {
    const long = "a".repeat(80);
    const result = deriveSessionTitle(long);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(49);
  });
});
