import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../../../types";
import { listTasksTool } from "./listTasks";
import { searchTasksTool } from "./searchTasks";
import type { AgentToolDeps } from "./types";

function task(p: Partial<Task> & { id: string; title?: string }): Task {
  return {
    id: p.id,
    title: p.title ?? "Report",
    description: p.description ?? null,
    category_id: p.category_id ?? null,
    status: p.status ?? "todo",
    priority: p.priority ?? "medium",
    estimated_minutes: p.estimated_minutes ?? null,
    due_date: p.due_date === undefined ? "2026-06-23" : p.due_date,
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

function deps(tasks: Task[]): AgentToolDeps {
  return {
    store: {
      getAllTasks: () => tasks,
      getCategories: () => [{ id: "c1", name: "Dev" }],
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      startTask: vi.fn(),
      pauseActiveTask: vi.fn(),
      completeTask: vi.fn(),
      dropTask: vi.fn(),
      moveTaskToBacklog: vi.fn(),
      ensureCategory: vi.fn(),
      refresh: vi.fn()
    } as never,
    ctx: {
      today: "2026-06-23",
      tasks: [],
      backlog: [],
      categories: [{ id: "c1", name: "Dev" }],
      assistantName: "Yolo",
      assistantSoul: "",
      allTaskRefs: []
    } as never,
    insights: null,
    history: [],
    now: () => "2026-06-23T00:00:00.000Z"
  };
}

describe("read tools", () => {
  it("list_tasks renders schedule times and filters by scope/status", async () => {
    const today = task({
      id: "t1",
      title: "Write report",
      category_id: "c1",
      due_date: "2026-06-23",
      planned_start_time: "09:00",
      planned_end_time: "10:00",
      estimated_minutes: 60
    });
    const done = task({ id: "t2", title: "Done", due_date: "2026-06-23", status: "done" });
    const backlog = task({ id: "t3", title: "Later", due_date: null });
    const res = await listTasksTool.execute({ scope: "today", status: "todo" }, deps([today, done, backlog]));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary).toContain('[t1] "Write report"');
      expect(res.summary).toContain("09:00-10:00");
      expect(res.summary).toContain("due 2026-06-23");
      expect(res.summary).not.toContain("[t2]");
      expect(res.summary).not.toContain("[t3]");
    }
  });

  it("search_tasks returns keyword matches", async () => {
    const res = await searchTasksTool.execute(
      { query: "launch" },
      deps([
        task({ id: "t1", title: "Launch checklist", description: "Ship the beta" }),
        task({ id: "t2", title: "Read book" })
      ])
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary).toContain('[t1] "Launch checklist"');
      expect(res.summary).not.toContain("[t2]");
    }
  });
});
