import { describe, expect, it } from "vitest";
import type { Task, TimeEntryWithTask } from "../../types";
import { computeSlipAnalysis } from "./slips";

const NOW = new Date("2026-06-19T12:00:00.000Z");

function task(over: Partial<Task>): Task {
  return {
    id: "t",
    title: "Task",
    description: null,
    category_id: null,
    status: "todo",
    priority: "medium",
    estimated_minutes: null,
    due_date: null,
    template_id: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    created_at: "2026-06-19T12:00:00.000Z",
    updated_at: "2026-06-19T12:00:00.000Z",
    completed_at: null,
    dropped_at: null,
    ...over
  };
}

function entryWithBlocker(blocker: string | null): TimeEntryWithTask {
  return {
    id: "e",
    task_id: "t",
    start_at: "2026-06-18T09:00:00.000Z",
    end_at: "2026-06-18T10:00:00.000Z",
    duration_seconds: 3600,
    note: null,
    blocker,
    next_action: null,
    completion_rate: null,
    created_at: "2026-06-18T09:00:00.000Z",
    updated_at: "2026-06-18T10:00:00.000Z",
    task_title: "Task",
    task_estimated_minutes: 60,
    category_id: null,
    category_name: null,
    category_color: null
  };
}

describe("computeSlipAnalysis", () => {
  it("flags overdue todo tasks", () => {
    const result = computeSlipAnalysis(
      [task({ id: "a", title: "Pay invoice", due_date: "2026-06-10" })],
      [],
      NOW
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("overdue");
    expect(result.items[0].taskId).toBe("a");
  });

  it("flags lingering old todo tasks with no due date", () => {
    const result = computeSlipAnalysis(
      [task({ id: "b", title: "Old idea", created_at: "2026-05-01T12:00:00.000Z" })],
      [],
      NOW
    );
    expect(result.items[0].kind).toBe("lingering");
  });

  it("ignores fresh todo tasks", () => {
    const result = computeSlipAnalysis([task({ created_at: "2026-06-18T12:00:00.000Z" })], [], NOW);
    expect(result.items).toHaveLength(0);
  });

  it("flags long-lived dropped tasks and caps to top 3 with a remainder", () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      task({
        id: `d${i}`,
        status: "dropped",
        created_at: "2026-05-01T12:00:00.000Z",
        dropped_at: "2026-06-15T12:00:00.000Z"
      })
    );
    const result = computeSlipAnalysis(tasks, [], NOW);
    expect(result.items).toHaveLength(3);
    expect(result.moreCount).toBe(2);
    expect(result.items[0].kind).toBe("dropped");
    expect(result.items[0].ageDays).toBe(45);
  });

  it("orders slips by ageDays descending", () => {
    const result = computeSlipAnalysis(
      [
        task({ id: "old", due_date: "2026-06-01", created_at: "2026-05-01T12:00:00.000Z" }),
        task({ id: "new", due_date: "2026-06-15", created_at: "2026-06-10T12:00:00.000Z" })
      ],
      [],
      NOW
    );
    expect(result.items.map((i) => i.taskId)).toEqual(["old", "new"]);
  });

  it("themes recurring blocker keywords seen at least twice", () => {
    const result = computeSlipAnalysis(
      [],
      [entryWithBlocker("waiting on design review"), entryWithBlocker("blocked by design feedback")],
      NOW
    );
    expect(result.blockerThemes.map((t) => t.keyword)).toContain("design");
  });
});
