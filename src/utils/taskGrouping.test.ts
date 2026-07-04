import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { isTaskOverdue, partitionTodayTasks } from "./taskGrouping";

const TODAY = "2026-06-02";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? "task_1",
    title: overrides.title ?? "Task",
    description: null,
    category_id: "inbox",
    status: overrides.status ?? "todo",
    priority: "medium",
    estimated_minutes: null,
    due_date: overrides.due_date ?? TODAY,
    template_id: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    completed_at: null,
    dropped_at: null,
    ...overrides
  };
}

describe("partitionTodayTasks", () => {
  it("keeps tasks due today in the today group", () => {
    const task = makeTask({ id: "t", due_date: TODAY });
    const { overdue, today } = partitionTodayTasks([task], TODAY);
    expect(overdue).toEqual([]);
    expect(today).toEqual([task]);
  });

  it("moves past-due unfinished tasks to the overdue group", () => {
    const stale = makeTask({ id: "stale", due_date: "2026-06-01", status: "todo" });
    const { overdue, today } = partitionTodayTasks([stale], TODAY);
    expect(overdue).toEqual([stale]);
    expect(today).toEqual([]);
  });

  it("keeps a past-due task in overdue regardless of status, so pause/resume never moves it", () => {
    const running = makeTask({ id: "run", due_date: "2026-05-30", status: "doing" });
    const paused = makeTask({ id: "p", due_date: "2026-05-31", status: "paused" });
    const { overdue, today } = partitionTodayTasks([running, paused], TODAY);
    expect(overdue).toEqual([running, paused]);
    expect(today).toEqual([]);
  });

  it("keeps backlog (no due date) and future tasks in today", () => {
    const backlog = makeTask({ id: "b", due_date: null });
    const future = makeTask({ id: "f", due_date: "2026-06-10" });
    const { overdue, today } = partitionTodayTasks([backlog, future], TODAY);
    expect(overdue).toEqual([]);
    expect(today).toEqual([backlog, future]);
  });

  it("preserves input order within each group", () => {
    const a = makeTask({ id: "a", due_date: "2026-05-30" });
    const b = makeTask({ id: "b", due_date: TODAY });
    const c = makeTask({ id: "c", due_date: "2026-06-01" });
    const { overdue, today } = partitionTodayTasks([a, b, c], TODAY);
    expect(overdue.map((t) => t.id)).toEqual(["a", "c"]);
    expect(today.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("isTaskOverdue", () => {
  it("is true for a past-due unfinished task", () => {
    expect(isTaskOverdue(makeTask({ due_date: "2026-06-01" }), TODAY)).toBe(true);
  });

  it("is false for a task due today", () => {
    expect(isTaskOverdue(makeTask({ due_date: TODAY }), TODAY)).toBe(false);
  });

  it("is true for a past-due task even while it is running", () => {
    expect(isTaskOverdue(makeTask({ due_date: "2026-05-30", status: "doing" }), TODAY)).toBe(true);
  });

  it("is false for backlog tasks", () => {
    expect(isTaskOverdue(makeTask({ due_date: null }), TODAY)).toBe(false);
  });
});
