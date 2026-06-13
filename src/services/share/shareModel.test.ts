import { describe, expect, it } from "vitest";
import type { TodayStats } from "../../types";
import { buildShareFilename, topFocusLine } from "./shareModel";

function stats(overrides: Partial<TodayStats> = {}): TodayStats {
  return {
    date: "2026-05-29",
    totalFocusSeconds: 0,
    completedTaskCount: 0,
    droppedTaskCount: 0,
    estimatedSeconds: 0,
    actualSeconds: 0,
    driftSeconds: 0,
    categoryStats: [],
    ...overrides
  };
}

describe("buildShareFilename", () => {
  it("builds a dated png name", () => {
    expect(buildShareFilename("2026-05-29")).toBe("yolo-my-day-2026-05-29.png");
  });
});

describe("topFocusLine", () => {
  it("returns null when no category time", () => {
    expect(topFocusLine(stats())).toBeNull();
  });

  it("summarises the largest category", () => {
    expect(
      topFocusLine(
        stats({
          categoryStats: [
            { categoryId: "dev", categoryName: "Development", color: "#7c3aed", totalSeconds: 14400 },
            { categoryId: "read", categoryName: "Reading", color: "#9333ea", totalSeconds: 2700 }
          ]
        })
      )
    ).toBe("Development · 4h");
  });
});
