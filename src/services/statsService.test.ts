import { describe, expect, it } from "vitest";
import { calculateTodayStats, splitEntrySecondsByDate } from "./statsService";
import type { Category, Task, TimeEntry } from "../types";

const categories: Category[] = [
  {
    id: "inbox",
    name: "Inbox",
    color: "#71717a",
    created_at: "2026-05-31T00:00:00.000Z",
    updated_at: "2026-05-31T00:00:00.000Z"
  },
  {
    id: "dev",
    name: "Development",
    color: "#2563eb",
    created_at: "2026-05-31T00:00:00.000Z",
    updated_at: "2026-05-31T00:00:00.000Z"
  }
];

const baseTask: Task = {
  id: "task-1",
  title: "Build timer",
  description: null,
  category_id: "dev",
  status: "done",
  priority: "high",
  estimated_minutes: 45,
  due_date: "2026-05-31",
  template_id: null,
  planned_start_time: null,
  planned_end_time: null,
  sort_order: null,
  created_at: "2026-05-31T08:00:00.000Z",
  updated_at: "2026-05-31T09:00:00.000Z",
  completed_at: "2026-05-31T10:00:00.000Z",
  dropped_at: null
};

describe("splitEntrySecondsByDate", () => {
  it("splits a time entry across local calendar days", () => {
    const entry: TimeEntry = {
      id: "entry-1",
      task_id: "task-1",
      start_at: "2026-05-31T23:30:00.000",
      end_at: "2026-06-01T00:30:00.000",
      duration_seconds: 3600,
      note: null,
      blocker: null,
      next_action: null,
      completion_rate: null,
      created_at: "2026-05-31T23:30:00.000",
      updated_at: "2026-06-01T00:30:00.000"
    };

    expect(splitEntrySecondsByDate(entry, "2026-05-31")).toBe(1800);
    expect(splitEntrySecondsByDate(entry, "2026-06-01")).toBe(1800);
  });

  it("uses the current time for an active entry", () => {
    const entry: TimeEntry = {
      id: "entry-2",
      task_id: "task-1",
      start_at: "2026-05-31T09:00:00.000",
      end_at: null,
      duration_seconds: null,
      note: null,
      blocker: null,
      next_action: null,
      completion_rate: null,
      created_at: "2026-05-31T09:00:00.000",
      updated_at: "2026-05-31T09:00:00.000"
    };

    expect(
      splitEntrySecondsByDate(entry, "2026-05-31", new Date("2026-05-31T09:15:00.000"))
    ).toBe(900);
  });
});

describe("calculateTodayStats", () => {
  it("calculates focus totals, category totals, task counts, and drift", () => {
    const droppedTask: Task = {
      ...baseTask,
      id: "task-2",
      title: "Discard stale task",
      status: "dropped",
      category_id: null,
      estimated_minutes: 15,
      completed_at: null,
      dropped_at: "2026-05-31T11:00:00.000"
    };
    const entries: TimeEntry[] = [
      {
        id: "entry-1",
        task_id: "task-1",
        start_at: "2026-05-31T09:00:00.000",
        end_at: "2026-05-31T10:00:00.000",
        duration_seconds: 3600,
        note: "Implemented timer",
        blocker: null,
        next_action: null,
        completion_rate: 100,
        created_at: "2026-05-31T09:00:00.000",
        updated_at: "2026-05-31T10:00:00.000"
      },
      {
        id: "entry-2",
        task_id: "task-2",
        start_at: "2026-05-31T10:30:00.000",
        end_at: "2026-05-31T10:45:00.000",
        duration_seconds: 900,
        note: null,
        blocker: null,
        next_action: null,
        completion_rate: 20,
        created_at: "2026-05-31T10:30:00.000",
        updated_at: "2026-05-31T10:45:00.000"
      }
    ];

    const stats = calculateTodayStats({
      date: "2026-05-31",
      tasks: [baseTask, droppedTask],
      timeEntries: entries,
      categories,
      now: new Date("2026-05-31T12:00:00.000")
    });

    expect(stats.totalFocusSeconds).toBe(4500);
    expect(stats.completedTaskCount).toBe(1);
    expect(stats.droppedTaskCount).toBe(1);
    expect(stats.estimatedSeconds).toBe(3600);
    expect(stats.driftSeconds).toBe(900);
    expect(stats.categoryStats).toEqual([
      { categoryId: "dev", categoryName: "Development", color: "#2563eb", totalSeconds: 3600 },
      { categoryId: "inbox", categoryName: "Inbox", color: "#71717a", totalSeconds: 900 }
    ]);
  });
});
