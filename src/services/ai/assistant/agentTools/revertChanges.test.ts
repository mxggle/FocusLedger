import { describe, expect, it, vi } from "vitest";
import { revertChangesTool } from "./revertChanges";
import type { AgentToolDeps, SessionToolCall, TaskUndoSnapshot, ToolCallRecord } from "./types";

function snapshot(overrides: Partial<TaskUndoSnapshot> = {}): TaskUndoSnapshot {
  return {
    title: "Report",
    description: null,
    category_id: null,
    priority: "medium",
    estimated_minutes: null,
    due_date: "2026-07-02",
    planned_start_time: null,
    planned_end_time: null,
    status: "todo",
    completed_at: null,
    dropped_at: null,
    updated_at: "u0",
    ...overrides
  };
}

function executedCall(id: string, taskId: string, title: string): ToolCallRecord {
  return {
    id,
    name: "move_to_backlog",
    args: { task_id: taskId },
    category: "write",
    destructive: false,
    summary: `Moved "${title}" to backlog`,
    status: "executed",
    undo: { kind: "restore_task", taskId, before: snapshot({ title }) }
  };
}

function depsWith(
  sessionToolCalls: SessionToolCall[],
  { updateTask = vi.fn(async () => ({ ok: true })), deleteTask = vi.fn(async () => ({ ok: true })) } = {}
): { deps: AgentToolDeps; updateTask: ReturnType<typeof vi.fn>; deleteTask: ReturnType<typeof vi.fn>; onReverted: ReturnType<typeof vi.fn> } {
  const onReverted = vi.fn();
  const deps = {
    store: { updateTask, deleteTask },
    ctx: {},
    insights: null,
    history: [],
    sessionToolCalls,
    onReverted,
    now: () => "now"
  } as never as AgentToolDeps;
  return { deps, updateTask, deleteTask, onReverted };
}

describe("revert_changes", () => {
  it("reports nothing to revert when the conversation has no applied changes", async () => {
    const { deps, updateTask } = depsWith([]);
    const res = await revertChangesTool.execute({}, deps);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.summary).toContain("nothing to revert");
    expect(updateTask).not.toHaveBeenCalled();
  });

  it('scope "last" reverts only the most recent message\'s executed calls, newest first', async () => {
    const entries: SessionToolCall[] = [
      { messageId: "m1", call: executedCall("c1", "t1", "Old change") },
      { messageId: "m2", call: executedCall("c2", "t2", "任务A") },
      { messageId: "m2", call: executedCall("c3", "t3", "任务B") }
    ];
    const { deps, updateTask, onReverted } = depsWith(entries);
    const res = await revertChangesTool.execute({ scope: "last" }, deps);
    expect(res.ok).toBe(true);
    expect(updateTask).toHaveBeenCalledTimes(2);
    expect(updateTask.mock.calls.map((c) => c[0])).toEqual(["t3", "t2"]);
    expect(updateTask.mock.calls[0][1]).toEqual(expect.objectContaining({ due_date: "2026-07-02" }));
    expect(onReverted.mock.calls).toEqual([
      ["m2", "c3"],
      ["m2", "c2"]
    ]);
  });

  it('scope "all" reverts every executed call in the conversation', async () => {
    const entries: SessionToolCall[] = [
      { messageId: "m1", call: executedCall("c1", "t1", "A") },
      { messageId: "m2", call: executedCall("c2", "t2", "B") }
    ];
    const { deps, updateTask } = depsWith(entries);
    const res = await revertChangesTool.execute({ scope: "all" }, deps);
    expect(res.ok).toBe(true);
    expect(updateTask.mock.calls.map((c) => c[0])).toEqual(["t2", "t1"]);
  });

  it("skips pending/reverted cards and surfaces per-call failures", async () => {
    const pending: SessionToolCall = {
      messageId: "m2",
      call: { ...executedCall("c2", "t2", "Queued"), status: "pending" }
    };
    const entries: SessionToolCall[] = [{ messageId: "m1", call: executedCall("c1", "t1", "A") }, pending];
    const updateTask = vi.fn(async () => ({ ok: false, message: "task not found" }));
    const { deps, onReverted } = depsWith(entries, { updateTask });
    const res = await revertChangesTool.execute({}, deps);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary).toContain("0 of 1");
      expect(res.summary).toContain("task not found");
    }
    expect(onReverted).not.toHaveBeenCalled();
  });

  it("reverts a created task by deleting it (delete_task undo)", async () => {
    const created: SessionToolCall = {
      messageId: "m1",
      call: {
        id: "c1",
        name: "create_task",
        args: { title: "New" },
        category: "write",
        destructive: false,
        summary: 'Created "New"',
        status: "executed",
        undo: { kind: "delete_task", taskId: "t9" }
      }
    };
    const { deps, deleteTask } = depsWith([created]);
    const res = await revertChangesTool.execute({}, deps);
    expect(res.ok).toBe(true);
    expect(deleteTask).toHaveBeenCalledWith("t9");
  });
});
