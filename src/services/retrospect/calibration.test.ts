import { describe, expect, it } from "vitest";
import type { TimeEntryWithTask } from "../../types";
import { computeEstimationCalibration } from "./calibration";

function entry(over: Partial<TimeEntryWithTask>): TimeEntryWithTask {
  return {
    id: "e",
    task_id: "t",
    start_at: "2026-06-01T09:00:00.000Z",
    end_at: "2026-06-01T10:00:00.000Z",
    duration_seconds: 3600,
    note: null,
    blocker: null,
    next_action: null,
    completion_rate: null,
    created_at: "2026-06-01T09:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    task_title: "Task",
    task_estimated_minutes: 60,
    category_id: "c1",
    category_name: "Deep Work",
    category_color: "#000",
    ...over
  };
}

describe("computeEstimationCalibration", () => {
  it("returns null overall when no entry has an estimate", () => {
    const result = computeEstimationCalibration([entry({ task_estimated_minutes: null })]);
    expect(result.overall).toBeNull();
    expect(result.byCategory).toEqual([]);
  });

  it("aggregates actual vs estimate across entries of the same task", () => {
    const entries = [
      entry({ task_id: "t1", duration_seconds: 1800, task_estimated_minutes: 60 }),
      entry({ task_id: "t1", duration_seconds: 1800, task_estimated_minutes: 60 })
    ];
    const result = computeEstimationCalibration(entries);
    expect(result.overall).not.toBeNull();
    expect(result.overall?.estimatedMinutes).toBe(60);
    expect(result.overall?.actualMinutes).toBe(60);
    expect(result.overall?.ratio).toBeCloseTo(1);
    expect(result.overall?.sampleSize).toBe(1);
    expect(result.overall?.confidence).toBe("low");
  });

  it("marks confidence ok at or above the sample threshold and groups by category", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry({ task_id: `t${i}`, duration_seconds: 5400, task_estimated_minutes: 60 })
    );
    const result = computeEstimationCalibration(entries);
    expect(result.overall?.sampleSize).toBe(5);
    expect(result.overall?.confidence).toBe("ok");
    expect(result.overall?.ratio).toBeCloseTo(1.5);
    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0].scope).toBe("Deep Work");
  });

  it("ignores tasks with no meaningful tracked time", () => {
    const result = computeEstimationCalibration([entry({ duration_seconds: 30 })]);
    expect(result.overall).toBeNull();
  });
});
