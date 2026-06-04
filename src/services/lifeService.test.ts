import { describe, expect, it } from "vitest";
import type { TimeEntryWithTask } from "../types";
import { WEEKS_PER_YEAR, weekRange } from "../utils/lifeWeeks";
import { aggregateLifeWeeks, peakDay } from "./lifeService";

const BIRTH = "1995-06-15";

function entry(overrides: Partial<TimeEntryWithTask>): TimeEntryWithTask {
  return {
    id: "e",
    task_id: "t",
    start_at: "2025-06-16T09:00:00.000Z",
    end_at: "2025-06-16T10:00:00.000Z",
    duration_seconds: 3600,
    note: null,
    blocker: null,
    next_action: null,
    completion_rate: null,
    created_at: "2025-06-16T09:00:00.000Z",
    updated_at: "2025-06-16T10:00:00.000Z",
    task_title: "Task",
    task_estimated_minutes: null,
    category_id: "dev",
    category_name: "Development",
    category_color: "#7c3aed",
    ...overrides
  };
}

describe("aggregateLifeWeeks", () => {
  it("buckets entries into the right life-week and sums focus", () => {
    const range = weekRange(BIRTH, WEEKS_PER_YEAR * 30)!; // age 30
    const start = range.start.toISOString();
    const result = aggregateLifeWeeks(
      [
        entry({ id: "a", start_at: start, duration_seconds: 1800 }),
        entry({ id: "b", start_at: start, duration_seconds: 1200 })
      ],
      BIRTH
    );

    const week = result.byWeek.get(WEEKS_PER_YEAR * 30);
    expect(week?.seconds).toBe(3000);
    expect(week?.sessions).toBe(2);
    expect(result.maxSeconds).toBe(3000);
  });

  it("aggregates categories richest-first and ignores pre-birth entries", () => {
    const range = weekRange(BIRTH, 500)!;
    const result = aggregateLifeWeeks(
      [
        entry({
          start_at: range.start.toISOString(),
          duration_seconds: 600,
          category_name: "Reading"
        }),
        entry({
          start_at: range.start.toISOString(),
          duration_seconds: 1800,
          category_name: "Development"
        }),
        entry({ start_at: "1990-01-01T00:00:00.000Z", duration_seconds: 999 })
      ],
      BIRTH
    );

    const week = result.byWeek.get(500);
    expect(week?.categories[0]?.name).toBe("Development");
    expect(week?.categories).toHaveLength(2);
    expect(result.byWeek.size).toBe(1); // pre-birth entry dropped
  });

  it("peakDay picks the day with the most focus", () => {
    const week = {
      seconds: 100,
      sessions: 2,
      categories: [],
      days: { "2025-06-16": 40, "2025-06-18": 60 }
    };
    expect(peakDay(week)).toBe("2025-06-18");
    expect(peakDay(undefined)).toBeNull();
  });
});
