import { describe, expect, it, vi } from "vitest";
import { ACTION_REGISTRY, validateAction } from "./actions";
import type { AssistantContext, AssistantTaskStore } from "./types";

const ctx: AssistantContext = {
  today: "2026-06-18",
  categories: [{ id: "c1", name: "Deep Work" }],
  tasks: [
    {
      id: "t1",
      title: "Write report",
      status: "todo",
      priority: "high",
      estimatedMinutes: 60,
      categoryId: "c1",
      plannedStartTime: null,
      plannedEndTime: null
    }
  ],
  backlog: [
    {
      id: "b1",
      title: "Backlog item",
      status: "todo",
      priority: "low",
      estimatedMinutes: null,
      categoryId: null,
      plannedStartTime: null,
      plannedEndTime: null
    }
  ],
  assistantName: "",
  assistantSoul: "",
  allTaskRefs: []
};

function makeCtx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  return {
    today: "2026-06-18",
    categories: [],
    tasks: [],
    backlog: [],
    assistantName: "",
    assistantSoul: "",
    allTaskRefs: [],
    ...overrides
  };
}

function makeFakeStore(): AssistantTaskStore {
  return {
    createTask: vi.fn().mockResolvedValue({ ok: true }),
    updateTask: vi.fn().mockResolvedValue({ ok: true }),
    rescheduleTask: vi.fn().mockResolvedValue({ ok: true }),
    moveTaskToBacklog: vi.fn().mockResolvedValue({ ok: true }),
    dropTask: vi.fn().mockResolvedValue({ ok: true }),
    completeTask: vi.fn().mockResolvedValue({ ok: true }),
    startTask: vi.fn().mockResolvedValue("started"),
    ensureCategory: vi.fn().mockResolvedValue("c-new")
  };
}

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
      updateTask: vi.fn(), rescheduleTask: vi.fn(), moveTaskToBacklog: vi.fn(),
      dropTask: vi.fn(), completeTask: vi.fn(), startTask: vi.fn(),
      ensureCategory: vi.fn()
    };
    const action = validateAction({ type: "create_task", title: "New task" }, ctx)!;
    const result = await ACTION_REGISTRY[action.type].execute(action.params, store);
    expect(result.ok).toBe(true);
    expect(store.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "New task" }));
  });

  it("start_task normalizes the string result to ActionResult", async () => {
    const store: AssistantTaskStore = {
      createTask: vi.fn(), updateTask: vi.fn(), rescheduleTask: vi.fn(), moveTaskToBacklog: vi.fn(),
      dropTask: vi.fn(), completeTask: vi.fn(),
      startTask: vi.fn().mockResolvedValue("failed"),
      ensureCategory: vi.fn()
    };
    const action = validateAction({ type: "start_task", task_id: "t1" }, ctx)!;
    const result = await ACTION_REGISTRY[action.type].execute(action.params, store);
    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });
});

describe("create_task category handling", () => {
  it("resolves an existing category by name to its id, no new_category_name", () => {
    const action = validateAction({ type: "create_task", title: "A", category: "Deep Work" }, ctx);
    expect(action).not.toBeNull();
    const params = action!.params as Record<string, unknown>;
    expect(params.category_id).toBe("c1");
    expect(params.new_category_name).toBeNull();
  });

  it("records an unknown category as new_category_name and labels it new", () => {
    const action = validateAction({ type: "create_task", title: "A", category: "Apartment Move" }, ctx);
    const params = action!.params as Record<string, unknown>;
    expect(params.category_id).toBeNull();
    expect(params.new_category_name).toBe("Apartment Move");
    expect(action!.summary.toLowerCase()).toContain("new project");
  });

  it("execute ensures the new category then creates the task", async () => {
    const store = {
      ensureCategory: vi.fn().mockResolvedValue("c-new"),
      createTask: vi.fn().mockResolvedValue({ ok: true })
    };
    const action = validateAction({ type: "create_task", title: "A", category: "Apartment Move" }, ctx)!;
    await ACTION_REGISTRY.create_task.execute(action.params, store as never);
    expect(store.ensureCategory).toHaveBeenCalledWith("Apartment Move");
    const createArg = store.createTask.mock.calls[0][0];
    expect(createArg.category_id).toBe("c-new");
    expect(createArg.new_category_name).toBeUndefined();
  });
});

describe("update_task", () => {
  const ctx = makeCtx({
    tasks: [{ id: "t1", title: "Anki feature", status: "todo", priority: "low",
      estimatedMinutes: null, categoryId: null, plannedStartTime: null, plannedEndTime: null }],
    categories: [{ id: "c-jp", name: "Japanese" }],
    allTaskRefs: [{ id: "t1", title: "Anki feature" }]
  });

  it("validates a partial update and describes the diff", () => {
    const action = validateAction(
      { type: "update_task", task_id: "t1", category: "Japanese", priority: "high" }, ctx
    );
    expect(action).not.toBeNull();
    expect(action!.summary).toContain("Anki feature");
    expect(action!.summary).toContain("Japanese");
    expect(action!.summary).toContain("high");
  });

  it("rejects an update with no changed fields", () => {
    expect(validateAction({ type: "update_task", task_id: "t1" }, ctx)).toBeNull();
  });

  it("rejects an unknown task id", () => {
    expect(validateAction({ type: "update_task", task_id: "nope", title: "x" }, ctx)).toBeNull();
  });

  it("marks a brand-new category for creation on apply", async () => {
    const action = validateAction(
      { type: "update_task", task_id: "t1", category: "Reading" }, ctx
    );
    expect(action).not.toBeNull();
    const store = makeFakeStore();
    await ACTION_REGISTRY.update_task.execute(action!.params, store);
    expect(store.ensureCategory).toHaveBeenCalledWith("Reading");
    expect(store.updateTask).toHaveBeenCalled();
  });
});
