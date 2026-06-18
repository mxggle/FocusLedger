import { describe, expect, it, vi } from "vitest";
import { ACTION_REGISTRY, validateAction } from "./actions";
import type { AssistantContext, AssistantTaskStore } from "./types";

const ctx: AssistantContext = {
  today: "2026-06-18",
  categories: [{ id: "c1", name: "Deep Work" }],
  tasks: [
    { id: "t1", title: "Write report", status: "todo", priority: "high", estimatedMinutes: 60, categoryId: "c1" }
  ],
  backlog: [
    { id: "b1", title: "Backlog item", status: "todo", priority: "low", estimatedMinutes: null, categoryId: null }
  ]
};

describe("validateAction", () => {
  it("rejects unknown action types", () => {
    expect(validateAction({ type: "explode", title: "x" }, ctx)).toBeNull();
  });

  it("create_task: requires a title, resolves category by id or name", () => {
    const ok = validateAction({ type: "create_task", title: "New task", category: "Deep Work" }, ctx);
    expect(ok?.type).toBe("create_task");
    expect((ok?.params as { category_id: string | null }).category_id).toBe("c1");
    expect(validateAction({ type: "create_task", title: "  " }, ctx)).toBeNull();
  });

  it("create_task: maps 'today' due date to the context date", () => {
    const ok = validateAction({ type: "create_task", title: "T", due_date: "today" }, ctx);
    expect((ok?.params as { due_date: string | null }).due_date).toBe("2026-06-18");
  });

  it("reschedule_task: requires a known task id and a date", () => {
    expect(validateAction({ type: "reschedule_task", task_id: "nope", due_date: "2026-06-20" }, ctx)).toBeNull();
    const ok = validateAction({ type: "reschedule_task", task_id: "t1", due_date: "2026-06-20" }, ctx);
    expect(ok?.type).toBe("reschedule_task");
  });

  it("drop_task is marked destructive; complete/start are not", () => {
    expect(validateAction({ type: "drop_task", task_id: "t1" }, ctx)?.destructive).toBe(true);
    expect(validateAction({ type: "complete_task", task_id: "t1" }, ctx)?.destructive).toBe(false);
  });
});

describe("registry execute", () => {
  it("create_task calls store.createTask with validated input", async () => {
    const store: AssistantTaskStore = {
      createTask: vi.fn().mockResolvedValue({ ok: true }),
      rescheduleTask: vi.fn(), moveTaskToBacklog: vi.fn(),
      dropTask: vi.fn(), completeTask: vi.fn(), startTask: vi.fn()
    };
    const action = validateAction({ type: "create_task", title: "New task" }, ctx)!;
    const result = await ACTION_REGISTRY[action.type].execute(action.params, store);
    expect(result.ok).toBe(true);
    expect(store.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "New task" }));
  });

  it("start_task normalizes the string result to ActionResult", async () => {
    const store: AssistantTaskStore = {
      createTask: vi.fn(), rescheduleTask: vi.fn(), moveTaskToBacklog: vi.fn(),
      dropTask: vi.fn(), completeTask: vi.fn(),
      startTask: vi.fn().mockResolvedValue("failed")
    };
    const action = validateAction({ type: "start_task", task_id: "t1" }, ctx)!;
    const result = await ACTION_REGISTRY[action.type].execute(action.params, store);
    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });
});
