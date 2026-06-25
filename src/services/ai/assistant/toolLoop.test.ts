import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../../types";
import { toolByName } from "./agentTools/registry";
import { runToolLoop } from "./toolLoop";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Report",
    planned_start_time: "09:00",
    status: "todo",
    priority: "medium",
    description: null,
    category_id: null,
    estimated_minutes: null,
    due_date: "2026-06-23",
    template_id: null,
    planned_end_time: null,
    sort_order: null,
    created_at: "x",
    updated_at: "u0",
    completed_at: null,
    dropped_at: null,
    ...overrides
  };
}

function depsWith({
  updateTask = vi.fn(async () => ({ ok: true })),
  createTask = vi.fn(async () => ({ ok: true, id: "created" })),
  tasks = [task()],
  getAllTasks
}: {
  updateTask?: ReturnType<typeof vi.fn>;
  createTask?: ReturnType<typeof vi.fn>;
  tasks?: Task[];
  getAllTasks?: () => Task[];
} = {}) {
  return {
    store: {
      getAllTasks: getAllTasks ?? (() => tasks),
      getCategories: () => [],
      updateTask,
      createTask,
      deleteTask: vi.fn(),
      startTask: vi.fn(),
      pauseActiveTask: vi.fn(),
      completeTask: vi.fn(),
      dropTask: vi.fn(),
      moveTaskToBacklog: vi.fn(),
      ensureCategory: vi.fn(),
      refresh: vi.fn()
    },
    ctx: {
      today: "2026-06-23",
      categories: [],
      tasks: [],
      backlog: [],
      assistantName: "Yolo",
      assistantSoul: "",
      allTaskRefs: []
    },
    insights: null,
    history: [],
    now: () => "u1"
  } as never;
}

describe("runToolLoop", () => {
  it("auto mode composes list_tasks then update_task and executes the write in-loop", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const replies = [
      '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}}]}',
      '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}',
      "Pushed your morning back 30 minutes."
    ];
    let i = 0;
    const generateChat = vi.fn(async () => replies[i++]);
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "delay everything 30 min" }],
        level: "auto",
        deps: depsWith({ updateTask: update })
      },
      { generateChat }
    );
    expect(update).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(res.reply).toContain("Pushed your morning");
    const exec = res.toolCalls.find((call) => call.name === "update_task");
    expect(exec?.status).toBe("executed");
    expect(exec?.undo).toBeTruthy();
  });

  it("ask mode defers the write as pending and does not execute", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const replies = [
      '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}',
      "Proposed."
    ];
    let i = 0;
    const res = await runToolLoop(
      {
        system: "s",
        messages: [{ role: "user", content: "x" }],
        level: "ask",
        deps: depsWith({ updateTask: update })
      },
      { generateChat: vi.fn(async () => replies[i++]) }
    );
    expect(update).not.toHaveBeenCalled();
    expect(res.toolCalls.find((call) => call.name === "update_task")?.status).toBe("pending");
  });

  it("labels queued task updates with the task title instead of the raw tool name", async () => {
    const replies = [
      '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30","planned_end_time":"10:00"}}]}',
      "Proposed."
    ];
    let i = 0;
    const res = await runToolLoop(
      {
        system: "s",
        messages: [{ role: "user", content: "shift report" }],
        level: "ask",
        deps: depsWith()
      },
      { generateChat: vi.fn(async () => replies[i++]) }
    );

    const pending = res.toolCalls.find((call) => call.name === "update_task");
    expect(pending?.summary).toContain("Report");
    expect(pending?.summary).toContain("09:30-10:00");
    expect(pending?.summary).not.toBe("update_task");
  });

  it("passes native tool specs to the provider call", async () => {
    const generateChat = vi.fn(async () => "Done.");

    await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "x" }],
        level: "ask",
        deps: depsWith()
      },
      { generateChat }
    );

    const firstInput = (generateChat.mock.calls[0] as unknown[] | undefined)?.[1] as
      | { tools?: unknown[] }
      | undefined;
    expect(firstInput?.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "list_tasks" }),
        expect.objectContaining({ name: "update_task" })
      ])
    );
  });

  it("aborts before starting when the signal is already aborted", async () => {
    const generateChat = vi.fn(async () => "Done.");
    const controller = new AbortController();
    controller.abort();
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "x" }],
        level: "auto",
        deps: depsWith(),
        signal: controller.signal
      },
      { generateChat }
    );
    expect(generateChat).not.toHaveBeenCalled();
    expect(res.reply.trim()).toBe("");
  });

  it("regression: bulk schedule shifts update existing tasks instead of creating a junk task", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const create = vi.fn(async () => ({ ok: true, id: "junk" }));
    const replies = [
      '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}}]}',
      '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}},{"name":"update_task","args":{"task_id":"t2","planned_start_time":"10:30"}}]}',
      "Delayed both scheduled tasks by 30 minutes."
    ];
    let i = 0;

    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "delay every task today by 30 minutes" }],
        level: "auto",
        deps: depsWith({
          updateTask: update,
          createTask: create,
          tasks: [task(), task({ id: "t2", title: "Review", planned_start_time: "10:00" })]
        })
      },
      { generateChat: vi.fn(async () => replies[i++]) }
    );

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, "t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(update).toHaveBeenNthCalledWith(2, "t2", expect.objectContaining({ planned_start_time: "10:30" }));
    expect(res.toolCalls.filter((call) => call.name === "update_task")).toHaveLength(2);
    expect(res.toolCalls.filter((call) => call.name === "update_task").every((call) => call.status === "executed")).toBe(true);
  });

  it("uses native toolCalls from generateChatV2 when provided", async () => {
    const list = vi.fn(async () => ({ ok: true, summary: "1 task" }));
    let call = 0;
    const v2 = async () =>
      call++ === 0
        ? { text: "", toolCalls: [{ name: "list_tasks", args: { scope: "today" } }] }
        : { text: "Done.", toolCalls: [] };
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "x" }],
        level: "auto",
        deps: depsWith({ getAllTasks: list as never })
      },
      { generateChatV2: v2 }
    );
    expect(res.reply).toContain("Done");
  });

  it("executes parallel read tools concurrently", async () => {
    const listTool = toolByName("list_tasks")!;
    let started = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const listExecute = vi.spyOn(listTool, "execute").mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      started += 1;
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      return { ok: true, summary: "ok" };
    });
    const v2 = async () => ({
      text: "",
      toolCalls: [
        { name: "list_tasks", args: { scope: "today" } },
        { name: "list_tasks", args: { scope: "backlog" } }
      ]
    });
    try {
      const res = await runToolLoop(
        {
          system: "sys",
          messages: [{ role: "user", content: "both scopes" }],
          level: "auto",
          deps: depsWith()
        },
        {
          generateChatV2: async () => {
            if (started === 0) return v2();
            return { text: "got both.", toolCalls: [] };
          }
        }
      );
      expect(listExecute).toHaveBeenCalledTimes(2);
      expect(maxInFlight).toBeGreaterThanOrEqual(2);
      expect(res.reply).toContain("got both");
    } finally {
      listExecute.mockRestore();
    }
  });
});
