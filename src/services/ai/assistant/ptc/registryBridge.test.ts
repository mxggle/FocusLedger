import { describe, expect, it, vi } from "vitest";
import { buildHostTools } from "./registryBridge";
import type { Task } from "../../../../types";
import type { AgentToolDeps, PermissionLevel, ToolCallRecord } from "../agentTools/types";

function task(p: Partial<Task> & { id: string }): Task {
  return {
    title: "Report",
    description: null,
    category_id: null,
    status: "todo",
    priority: "medium",
    estimated_minutes: null,
    due_date: "2026-06-23",
    template_id: null,
    planned_start_time: "09:00",
    planned_end_time: null,
    sort_order: null,
    created_at: "x",
    updated_at: "u0",
    completed_at: null,
    dropped_at: null,
    ...p
  };
}

function deps(tasks: Task[], overrides: Partial<Record<"updateTask" | "dropTask", ReturnType<typeof vi.fn>>> = {}): AgentToolDeps {
  return {
    store: {
      getAllTasks: () => tasks,
      getCategories: () => [],
      createTask: vi.fn(),
      updateTask: overrides.updateTask ?? vi.fn(async () => ({ ok: true })),
      deleteTask: vi.fn(),
      startTask: vi.fn(),
      pauseActiveTask: vi.fn(),
      completeTask: vi.fn(),
      dropTask: overrides.dropTask ?? vi.fn(async () => ({ ok: true })),
      moveTaskToBacklog: vi.fn(),
      ensureCategory: vi.fn(),
      refresh: vi.fn()
    } as never,
    ctx: { today: "2026-06-23", tasks: [] } as never,
    insights: null,
    history: [],
    now: () => "t1"
  };
}

function host(name: string, level: PermissionLevel, tasks: Task[], records: ToolCallRecord[], overrides = {}) {
  const tools = buildHostTools(deps(tasks, overrides), level, records);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`host tool ${name} not built`);
  return tool;
}

describe("buildHostTools (PTC bridge)", () => {
  it("excludes loop-control tools from the program surface", () => {
    const tools = buildHostTools(deps([]), "auto", []);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("clarify");
    expect(names).not.toContain("execute_program");
    expect(names).toContain("update_task");
  });

  it("runs reads immediately and does not record them", async () => {
    const records: ToolCallRecord[] = [];
    const result = (await host("list_tasks", "auto", [task({ id: "t1" })], records).execute({ scope: "today" })) as {
      ok: boolean;
    };
    expect(result.ok).toBe(true);
    expect(records).toHaveLength(0);
  });

  it("executes a reversible write in auto mode and records it executed", async () => {
    const records: ToolCallRecord[] = [];
    const update = vi.fn(async () => ({ ok: true }));
    const result = (await host("update_task", "auto", [task({ id: "t1" })], records, { updateTask: update }).execute({
      task_id: "t1",
      planned_start_time: "09:30"
    })) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalled();
    expect(records[0]?.status).toBe("executed");
  });

  it("queues a write as pending in ask mode without executing", async () => {
    const records: ToolCallRecord[] = [];
    const update = vi.fn(async () => ({ ok: true }));
    const result = (await host("update_task", "ask", [task({ id: "t1" })], records, { updateTask: update }).execute({
      task_id: "t1",
      planned_start_time: "09:30"
    })) as { queued?: boolean };
    expect(update).not.toHaveBeenCalled();
    expect(result.queued).toBe(true);
    expect(records[0]?.status).toBe("pending");
  });

  it("queues a status→dropped update for confirmation in auto mode (per-call destructive gate)", async () => {
    const records: ToolCallRecord[] = [];
    const drop = vi.fn(async () => ({ ok: true }));
    const result = (await host("update_task", "auto", [task({ id: "t1" })], records, { dropTask: drop }).execute({
      task_id: "t1",
      status: "dropped"
    })) as { queued?: boolean };
    // Dropping via a program must not bypass the confirm card.
    expect(drop).not.toHaveBeenCalled();
    expect(result.queued).toBe(true);
    expect(records[0]?.status).toBe("pending");
    expect(records[0]?.destructive).toBe(true);
  });
});
