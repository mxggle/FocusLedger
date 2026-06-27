import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../../../types";

const state = vi.hoisted(() => ({
  allTasks: [] as Task[],
  categories: [{ id: "c1", name: "Dev" }],
  createTask: vi.fn(async () => ({ ok: true })),
  updateTask: vi.fn(async () => ({ ok: true })),
  deleteTask: vi.fn(async () => ({ ok: true })),
  startTask: vi.fn(async () => "started"),
  pauseActiveTask: vi.fn(async () => ({ ok: true })),
  completeTask: vi.fn(async () => ({ ok: true })),
  dropTask: vi.fn(async () => ({ ok: true })),
  moveTaskToBacklog: vi.fn(async () => ({ ok: true })),
  ensureCategory: vi.fn(async () => "c1"),
  refresh: vi.fn(async () => {})
}));

vi.mock("../../../../stores/taskStore", () => ({ useTaskStore: { getState: () => state } }));

import { createAgentTaskStore } from "./storeAdapter";

function task(id: string): Task {
  return {
    id,
    title: id,
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
    created_at: "x",
    updated_at: "x",
    completed_at: null,
    dropped_at: null
  };
}

describe("createAgentTaskStore", () => {
  it("reads live tasks/categories", () => {
    state.allTasks = [task("t1")];
    const s = createAgentTaskStore();
    expect(s.getAllTasks().map((t) => t.id)).toEqual(["t1"]);
    expect(s.getCategories()).toEqual([{ id: "c1", name: "Dev" }]);
  });

  it("createTask captures the new id by diffing when the store omits it", async () => {
    const before = [task("t1")];
    state.allTasks = before;
    state.createTask.mockImplementation(async () => {
      state.allTasks = [...before, task("t2")];
      return { ok: true };
    });
    const s = createAgentTaskStore();
    const res = await s.createTask({ title: "new" });
    expect(res).toEqual({ ok: true, id: "t2", message: undefined });
  });
});
