import { describe, expect, it } from "vitest";
import type { Task, TimeEntryWithTask } from "../../types";
import { computeWeeklyReview } from "./weeklyReview";

const NOW = new Date("2026-06-19T12:00:00.000Z");

function entry(over: Partial<TimeEntryWithTask>): TimeEntryWithTask {
  return {
    id: "e",
    task_id: "t",
    start_at: "2026-06-18T09:00:00.000Z",
    end_at: "2026-06-18T10:00:00.000Z",
    duration_seconds: 3600,
    note: null,
    blocker: null,
    next_action: null,
    completion_rate: null,
    created_at: "2026-06-18T09:00:00.000Z",
    updated_at: "2026-06-18T10:00:00.000Z",
    task_title: "Task",
    task_estimated_minutes: 60,
    category_id: "c1",
    category_name: "Deep Work",
    category_color: "#000",
    ...over
  };
}

function task(over: Partial<Task>): Task {
  return {
    id: "t",
    title: "Task",
    description: null,
    category_id: null,
    status: "done",
    priority: "medium",
    estimated_minutes: null,
    due_date: null,
    template_id: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-18T12:00:00.000Z",
    completed_at: null,
    dropped_at: null,
    ...over
  };
}

describe("computeWeeklyReview", () => {
  it("sums minutes per window and computes the delta", () => {
    const review = computeWeeklyReview(
      [entry({ duration_seconds: 3600 }), entry({ duration_seconds: 1800 })],
      [entry({ duration_seconds: 1800 })],
      [],
      NOW
    );
    expect(review.thisWeekMinutes).toBe(90);
    expect(review.lastWeekMinutes).toBe(30);
    expect(review.deltaMinutes).toBe(60);
  });

  it("ranks category movers by absolute delta", () => {
    const review = computeWeeklyReview(
      [entry({ category_name: "Deep Work", duration_seconds: 7200 })],
      [entry({ category_name: "Deep Work", duration_seconds: 1800 })],
      [],
      NOW
    );
    expect(review.categoryDeltas[0].category).toBe("Deep Work");
    expect(review.categoryDeltas[0].deltaMinutes).toBe(90);
  });

  it("counts tasks completed and dropped in the last 7 days", () => {
    const review = computeWeeklyReview(
      [],
      [],
      [
        task({ status: "done", completed_at: "2026-06-17T12:00:00.000Z" }),
        task({ status: "done", completed_at: "2026-06-01T12:00:00.000Z" }),
        task({ status: "dropped", dropped_at: "2026-06-16T12:00:00.000Z" })
      ],
      NOW
    );
    expect(review.completedCount).toBe(1);
    expect(review.droppedCount).toBe(1);
  });
});
