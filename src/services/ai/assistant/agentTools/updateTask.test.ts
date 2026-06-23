import { describe, expect, it, vi } from "vitest";
import { updateTaskTool } from "./updateTask";
import type { Task } from "../../../../types";
import type { AgentToolDeps } from "./types";

function task(p: Partial<Task> & { id: string }): Task {
  return {
    id: p.id,
    title: p.title ?? "Report",
    description: null,
    category_id: null,
    status: p.status ?? "todo",
    priority: p.priority ?? "medium",
    estimated_minutes: null,
    due_date: null,
    template_id: null,
    planned_start_time: p.planned_start_time ?? null,
    planned_end_time: p.planned_end_time ?? null,
    sort_order: null,
    created_at: "x",
    updated_at: p.updated_at ?? "u0",
    completed_at: null,
    dropped_at: null
  };
}

function deps(tasks: Task[], updateTask = vi.fn(async () => ({ ok: true }))): AgentToolDeps {
  return {
    store: {
      getAllTasks: () => tasks,
      getCategories: () => [{ id: "c1", name: "Dev" }],
      createTask: vi.fn(),
      updateTask,
      deleteTask: vi.fn(),
      startTask: vi.fn(),
      pauseActiveTask: vi.fn(),
      completeTask: vi.fn(),
      dropTask: vi.fn(),
      moveTaskToBacklog: vi.fn(),
      ensureCategory: vi.fn(async () => "c2"),
      refresh: vi.fn()
    } as never,
    ctx: { today: "2026-06-23" } as never,
    insights: null,
    history: [],
    now: () => "t1"
  };
}

describe("update_task tool", () => {
  it("sets planned_start_time and returns a restore_task undo with the prior value", async () => {
    const t = task({ id: "t1", planned_start_time: "09:00", updated_at: "u0" });
    const update = vi.fn(async () => ({ ok: true }));
    const res = await updateTaskTool.execute({ task_id: "t1", planned_start_time: "09:30" }, deps([t], update));
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    if (res.ok) {
      expect(res.undo).toEqual({
        kind: "restore_task",
        taskId: "t1",
        before: expect.objectContaining({ planned_start_time: "09:00" })
      });
    }
  });

  it("rejects an unknown task id", async () => {
    const res = await updateTaskTool.execute({ task_id: "ghost", title: "X" }, deps([]));
    expect(res.ok).toBe(false);
  });

  it("rejects a bad time format", async () => {
    const res = await updateTaskTool.execute({ task_id: "t1", planned_start_time: "9am" }, deps([task({ id: "t1" })]));
    expect(res.ok).toBe(false);
  });
});
