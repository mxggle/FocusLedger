import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../../../types";
import { completeTaskTool } from "./completeTask";
import { createTaskTool } from "./createTask";
import { dropTaskTool } from "./dropTask";
import { moveToBacklogTool } from "./moveToBacklog";
import { pauseTaskTool } from "./pauseTask";
import { startTaskTool } from "./startTask";
import type { AgentToolDeps } from "./types";

function task(p: Partial<Task> & { id: string }): Task {
  return {
    id: p.id,
    title: p.title ?? "Report",
    description: p.description ?? null,
    category_id: p.category_id ?? null,
    status: p.status ?? "todo",
    priority: p.priority ?? "medium",
    estimated_minutes: p.estimated_minutes ?? null,
    due_date: p.due_date ?? null,
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
      createTask: vi.fn(async () => ({ ok: true, id: "new1" })),
      updateTask: vi.fn(async () => ({ ok: true })),
      deleteTask: vi.fn(async () => ({ ok: true })),
      startTask: vi.fn(async () => "started" as const),
      pauseActiveTask: vi.fn(async () => ({ ok: true })),
      completeTask: vi.fn(async () => ({ ok: true })),
      dropTask: vi.fn(async () => ({ ok: true })),
      moveTaskToBacklog: vi.fn(async () => ({ ok: true })),
      ensureCategory: vi.fn(async () => "c2"),
      refresh: vi.fn()
    },
    ctx: { today: "2026-06-23" } as never,
    insights: null,
    history: [],
    now: () => "t1"
  };
}

describe("write tools", () => {
  it("create_task creates and returns delete_task undo", async () => {
    const d = deps([]);
    const create = vi.fn(async () => ({ ok: true, id: "new1" }));
    d.store.createTask = create;
    const res = await createTaskTool.execute({ title: "Plan launch", due_date: "today" }, d);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: "Plan launch", due_date: "2026-06-23" }));
    if (res.ok) expect(res.undo).toEqual({ kind: "delete_task", taskId: "new1" });
  });

  it("create_task fails if the created id is unavailable", async () => {
    const d = deps([]);
    d.store.createTask = vi.fn(async () => ({ ok: true }));
    const res = await createTaskTool.execute({ title: "No id" }, d);
    expect(res.ok).toBe(false);
  });

  it("start_task starts the task and returns restore_task undo", async () => {
    const t = task({ id: "t1", status: "paused" });
    const d = deps([t]);
    const res = await startTaskTool.execute({ task_id: "t1" }, d);
    expect(d.store.startTask).toHaveBeenCalledWith("t1");
    if (res.ok) expect(res.undo).toEqual({ kind: "restore_task", taskId: "t1", before: expect.objectContaining({ status: "paused" }) });
  });

  it("pause_task pauses the running task and returns restore_task undo", async () => {
    const t = task({ id: "t1", status: "doing" });
    const d = deps([t]);
    const res = await pauseTaskTool.execute({}, d);
    expect(d.store.pauseActiveTask).toHaveBeenCalled();
    if (res.ok) expect(res.undo).toEqual({ kind: "restore_task", taskId: "t1", before: expect.objectContaining({ status: "doing" }) });
  });

  it("complete_task completes the task and returns restore_task undo", async () => {
    const t = task({ id: "t1", status: "todo" });
    const d = deps([t]);
    const res = await completeTaskTool.execute({ task_id: "t1", note: "done" }, d);
    expect(d.store.completeTask).toHaveBeenCalledWith("t1", "done");
    if (res.ok) expect(res.undo).toEqual({ kind: "restore_task", taskId: "t1", before: expect.objectContaining({ status: "todo" }) });
  });

  it("move_to_backlog moves the task and returns restore_task undo", async () => {
    const t = task({ id: "t1", due_date: "2026-06-23" });
    const d = deps([t]);
    const res = await moveToBacklogTool.execute({ task_id: "t1" }, d);
    expect(d.store.moveTaskToBacklog).toHaveBeenCalledWith("t1");
    if (res.ok) expect(res.undo).toEqual({ kind: "restore_task", taskId: "t1", before: expect.objectContaining({ due_date: "2026-06-23" }) });
  });

  it("drop_task drops the task and returns restore_task undo", async () => {
    const t = task({ id: "t1", status: "todo" });
    const d = deps([t]);
    const res = await dropTaskTool.execute({ task_id: "t1" }, d);
    expect(dropTaskTool.destructive).toBe(true);
    expect(d.store.dropTask).toHaveBeenCalledWith("t1");
    if (res.ok) expect(res.undo).toEqual({ kind: "restore_task", taskId: "t1", before: expect.objectContaining({ status: "todo" }) });
  });

  it("returns an error for unknown task ids", async () => {
    const d = deps([]);
    const res = await completeTaskTool.execute({ task_id: "ghost" }, d);
    expect(res.ok).toBe(false);
  });
});
