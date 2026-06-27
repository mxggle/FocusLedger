import { describe, expect, it, vi } from "vitest";
import { hasDrifted, revertToolCall } from "./revert";
import type { AgentTaskStore, TaskUndoSnapshot, ToolCallRecord } from "./types";

function store(): AgentTaskStore {
  return {
    getAllTasks: () => [],
    getCategories: () => [],
    createTask: vi.fn(async () => ({ ok: true })),
    updateTask: vi.fn(async () => ({ ok: true })),
    deleteTask: vi.fn(async () => ({ ok: true })),
    startTask: vi.fn(async () => "started" as const),
    pauseActiveTask: vi.fn(async () => ({ ok: true })),
    completeTask: vi.fn(async () => ({ ok: true })),
    dropTask: vi.fn(async () => ({ ok: true })),
    moveTaskToBacklog: vi.fn(async () => ({ ok: true })),
    ensureCategory: vi.fn(async () => "c1"),
    refresh: vi.fn(async () => {})
  };
}

const before: TaskUndoSnapshot = {
  title: "T",
  description: null,
  category_id: null,
  priority: "medium",
  estimated_minutes: null,
  due_date: null,
  planned_start_time: "09:00",
  planned_end_time: null,
  status: "todo",
  completed_at: null,
  dropped_at: null,
  updated_at: "2026-06-23T00:00:00.000Z"
};

function rec(undo: ToolCallRecord["undo"]): ToolCallRecord {
  return {
    id: "r1",
    name: "update_task",
    args: {},
    category: "write",
    destructive: false,
    summary: "s",
    status: "executed",
    undo
  };
}

describe("revertToolCall", () => {
  it("restore_task writes the prior snapshot back", async () => {
    const s = store();
    const res = await revertToolCall(rec({ kind: "restore_task", taskId: "t1", before }), s);
    expect(res.ok).toBe(true);
    expect(s.updateTask).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ planned_start_time: "09:00", status: "todo" })
    );
  });

  it("restore_task round-trips the lifecycle timestamps so revert clears a stale completion", async () => {
    const s = store();
    const completed = { ...before, status: "done" as const, completed_at: "2026-06-20T00:00:00.000Z" };
    await revertToolCall(rec({ kind: "restore_task", taskId: "t1", before: completed }), s);
    expect(s.updateTask).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ status: "done", completed_at: "2026-06-20T00:00:00.000Z", dropped_at: null })
    );
  });

  it("delete_task removes a created task", async () => {
    const s = store();
    await revertToolCall(rec({ kind: "delete_task", taskId: "t9" }), s);
    expect(s.deleteTask).toHaveBeenCalledWith("t9");
  });

  it("flags drift only when current updated_at differs from the post-action expected value", () => {
    const r = { ...rec({ kind: "restore_task", taskId: "t1", before }), expectedUpdatedAt: "u1" };
    expect(hasDrifted(r, { updated_at: "u1" })).toBe(false);
    expect(hasDrifted(r, { updated_at: "u2" })).toBe(true);
  });

  it("refuses when not executed or no undo", async () => {
    const s = store();
    const r = { ...rec(undefined), status: "pending" as const };
    expect((await revertToolCall(r, s)).ok).toBe(false);
  });
});
