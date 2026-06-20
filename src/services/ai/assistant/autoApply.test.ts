import { describe, expect, it, vi } from "vitest";
import { autoApplyActions } from "./autoApply";
import type { AssistantTaskStore, ProposedAction } from "./types";

function makeFakeStore(overrides: Partial<AssistantTaskStore> = {}): AssistantTaskStore {
  return {
    createTask: vi.fn().mockResolvedValue({ ok: true }),
    updateTask: vi.fn().mockResolvedValue({ ok: true }),
    rescheduleTask: vi.fn().mockResolvedValue({ ok: true }),
    moveTaskToBacklog: vi.fn().mockResolvedValue({ ok: true }),
    dropTask: vi.fn().mockResolvedValue({ ok: true }),
    completeTask: vi.fn().mockResolvedValue({ ok: true }),
    startTask: vi.fn().mockResolvedValue("started"),
    ensureCategory: vi.fn().mockResolvedValue("c-new"),
    ...overrides
  };
}

function action(over: Partial<ProposedAction> & Pick<ProposedAction, "type" | "params">): ProposedAction {
  return {
    id: `act-${Math.random().toString(36).slice(2)}`,
    summary: "do a thing",
    destructive: false,
    status: "pending",
    ...over
  };
}

const update = (taskId: string): ProposedAction =>
  action({
    type: "update_task",
    summary: `Update ${taskId}`,
    params: { task_id: taskId, title: taskId, changes: { category_id: "c1" }, new_category_name: null, summaryParts: ["category → Dev"] }
  });

describe("autoApplyActions", () => {
  it("executes reversible actions immediately and marks them applied", async () => {
    const store = makeFakeStore();
    const result = await autoApplyActions([update("t1"), update("t2"), update("t3")], store);

    expect(result.appliedCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(result.actions.every((a) => a.status === "applied")).toBe(true);
    expect(store.updateTask).toHaveBeenCalledTimes(3);
  });

  it("leaves destructive actions pending for confirmation — never executes them", async () => {
    const store = makeFakeStore();
    const drop = action({
      type: "drop_task",
      destructive: true,
      summary: "Drop t9",
      params: { task_id: "t9", title: "t9" }
    });

    const result = await autoApplyActions([update("t1"), drop], store);

    expect(result.appliedCount).toBe(1);
    expect(result.pendingDestructiveCount).toBe(1);
    expect(store.updateTask).toHaveBeenCalledTimes(1);
    expect(store.dropTask).not.toHaveBeenCalled();
    const dropped = result.actions.find((a) => a.type === "drop_task");
    expect(dropped?.status).toBe("pending");
  });

  it("marks a failed action failed without sinking the rest of the batch", async () => {
    const store = makeFakeStore({
      updateTask: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, message: "boom" })
        .mockResolvedValue({ ok: true })
    });

    const result = await autoApplyActions([update("t1"), update("t2")], store);

    expect(result.failedCount).toBe(1);
    expect(result.appliedCount).toBe(1);
    const failed = result.actions[0];
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("boom");
  });

  it("marks an action failed when execute throws", async () => {
    const store = makeFakeStore({ updateTask: vi.fn().mockRejectedValue(new Error("network")) });
    const result = await autoApplyActions([update("t1")], store);
    expect(result.failedCount).toBe(1);
    expect(result.actions[0].status).toBe("failed");
    expect(result.actions[0].error).toBe("network");
  });

  it("ignores actions that are not pending", async () => {
    const store = makeFakeStore();
    const already = action({ type: "update_task", status: "applied", params: { task_id: "t1", title: "t1", changes: {}, new_category_name: null, summaryParts: [] } });
    const result = await autoApplyActions([already], store);
    expect(result.appliedCount).toBe(0);
    expect(store.updateTask).not.toHaveBeenCalled();
    expect(result.actions[0].status).toBe("applied");
  });
});
