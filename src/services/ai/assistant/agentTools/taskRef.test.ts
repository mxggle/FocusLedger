import { describe, expect, it } from "vitest";
import type { Task } from "../../../../types";
import { queuedWriteError } from "./permissions";
import { resolveTaskRef, shortTaskId, unknownTaskRefError } from "./taskRef";
import type { AgentToolDeps } from "./types";

function task(p: Partial<Task> & { id: string }): Task {
  return {
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
    sort_order: 0,
    completed_at: null,
    dropped_at: null,
    completion_note: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...p
  } as Task;
}

const A = task({ id: "task_e41f3a2b-1111-4222-8333-444455556666", title: "Mock Interview" });
const B = task({ id: "task_3d5c9e70-aaaa-4bbb-8ccc-ddddeeeeffff", title: "日语听力" });
const C = task({ id: "task_e41f3a99-2222-4333-8444-555566667777", title: "阅读" });
const TASKS = [A, B, C];

describe("shortTaskId", () => {
  it("shortens a canonical task uuid to task_ + 8 hex chars", () => {
    expect(shortTaskId(A.id)).toBe("task_e41f3a2b");
  });

  it("passes non-canonical ids through unchanged", () => {
    expect(shortTaskId("t1")).toBe("t1");
    expect(shortTaskId("ghost")).toBe("ghost");
  });
});

describe("resolveTaskRef", () => {
  it("resolves an exact id", () => {
    expect(resolveTaskRef(TASKS, A.id)).toBe(A);
  });

  it("resolves the short id form shown in prompts and tool output", () => {
    expect(resolveTaskRef(TASKS, "task_3d5c9e70")).toBe(B);
  });

  it("resolves a unique prefix with the task_ prefix dropped", () => {
    expect(resolveTaskRef(TASKS, "3d5c9e70")).toBe(B);
  });

  it("resolves a full uuid with its dashes reflowed or removed", () => {
    expect(resolveTaskRef(TASKS, "task_3d5c9e70aaaa4bbb8cccddddeeeeffff")).toBe(B);
  });

  it("refuses an ambiguous prefix instead of guessing", () => {
    // A and C share the 6-char prefix "e41f3a".
    expect(resolveTaskRef(TASKS, "task_e41f3a")).toBeUndefined();
  });

  it("refuses fragments too short to trust", () => {
    expect(resolveTaskRef(TASKS, "3d5c")).toBeUndefined();
  });

  it("falls back to a unique exact title, case-insensitively", () => {
    expect(resolveTaskRef(TASKS, "mock interview")).toBe(A);
    expect(resolveTaskRef(TASKS, "日语听力")).toBe(B);
  });

  it("returns nothing for a hallucinated id", () => {
    expect(resolveTaskRef(TASKS, "task_00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });
});

describe("unknownTaskRefError", () => {
  it("offers the closest ids when the ref shares a prefix (a garbled copy keeps its head)", () => {
    const message = unknownTaskRefError(TASKS, "task_3d5c9e70-aaaa-4bbb-8ccc-badbadbadbad");
    expect(message).toContain('Unknown task_id');
    expect(message).toContain("[task_3d5c9e70]");
    expect(message).toContain("日语听力");
  });

  it("offers a title match when the ref is a decorated title", () => {
    const message = unknownTaskRefError([A, B], "Mock Interview（录音）");
    expect(message).toContain("Mock Interview");
    expect(message).toContain("[task_e41f3a2b]");
  });

  it("gives plain guidance when nothing is close", () => {
    const message = unknownTaskRefError(TASKS, "task_ffffffff-0000-4000-8000-000000000000");
    expect(message).not.toContain("Closest matches");
    expect(message).toContain("list_tasks");
  });
});

describe("queuedWriteError", () => {
  const deps = {
    store: { getAllTasks: () => TASKS }
  } as unknown as AgentToolDeps;

  it("passes writes whose task_id resolves (short form included)", () => {
    expect(queuedWriteError({ task_id: A.id }, deps)).toBeNull();
    expect(queuedWriteError({ task_id: "task_e41f3a2b" }, deps)).toBeNull();
  });

  it("fails writes whose task_id can never apply, with recovery hints", () => {
    const error = queuedWriteError({ task_id: "task_e41f3a2b-9999-9999-9999-999999999999" }, deps);
    expect(error).toContain("Unknown task_id");
  });

  it("ignores writes without a task_id (create_task, pause_task)", () => {
    expect(queuedWriteError({ title: "New task" }, deps)).toBeNull();
    expect(queuedWriteError({}, deps)).toBeNull();
  });
});
