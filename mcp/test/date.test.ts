import { describe, expect, it } from "vitest";
import { isValidDateKey } from "../src/util/date.js";

describe("date utilities", () => {
  it("rejects impossible calendar dates", () => {
    expect(isValidDateKey("2026-02-31")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("2026-00-10")).toBe(false);
  });
});
