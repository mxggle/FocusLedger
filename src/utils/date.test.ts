import { describe, expect, it } from "vitest";
import { formatDateLabel } from "./date";

describe("formatDateLabel", () => {
  it("omits the year for dates in the reference year", () => {
    expect(formatDateLabel("2026-06-18", new Date(2026, 0, 1))).toBe(
      "Thu, Jun 18"
    );
  });

  it("includes the year for dates outside the reference year", () => {
    expect(formatDateLabel("2027-01-02", new Date(2026, 5, 18))).toBe(
      "Sat, Jan 2, 2027"
    );
  });
});
