import { describe, expect, it } from "vitest";
import type { CategoryStats } from "../../types";
import { buildDonutModel } from "./donutModel";

function stat(overrides: Partial<CategoryStats> = {}): CategoryStats {
  return {
    categoryId: "c1",
    categoryName: "Deep Work",
    color: "#6366f1",
    totalSeconds: 3600,
    ...overrides
  };
}

describe("buildDonutModel", () => {
  it("returns no segments when there is no time", () => {
    expect(buildDonutModel([])).toEqual({ segments: [], totalSeconds: 0 });
    expect(buildDonutModel([stat({ totalSeconds: 0 })])).toEqual({
      segments: [],
      totalSeconds: 0
    });
  });

  it("makes a single category a full ring", () => {
    const { segments, totalSeconds } = buildDonutModel([stat({ totalSeconds: 1800 })]);
    expect(totalSeconds).toBe(1800);
    expect(segments).toHaveLength(1);
    expect(segments[0].pct).toBe(100);
    expect(segments[0].dashArray).toBe("100 0");
    expect(segments[0].dashOffset).toBe(0);
  });

  it("splits proportions and offsets each segment cumulatively", () => {
    const { segments, totalSeconds } = buildDonutModel([
      stat({ categoryId: "a", totalSeconds: 3600 }),
      stat({ categoryId: "b", totalSeconds: 1200 })
    ]);
    expect(totalSeconds).toBe(4800);
    expect(segments[0].pct).toBe(75);
    expect(segments[0].dashArray).toBe("75 25");
    expect(segments[0].dashOffset).toBe(0);
    expect(segments[1].pct).toBe(25);
    expect(segments[1].dashArray).toBe("25 75");
    expect(segments[1].dashOffset).toBe(-75);
  });

  it("falls back to a neutral color when a category has none", () => {
    const { segments } = buildDonutModel([stat({ color: null })]);
    expect(segments[0].color).toBe("#71717a");
  });
});
