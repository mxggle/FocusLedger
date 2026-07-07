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

  it("clarify ends the turn with the question as the reply and runs no writes", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const generateChat = vi.fn(async () =>
      '{"tool_calls":[{"name":"clarify","args":{"question":"Which day did you mean?","options":["Today","Tomorrow"]}}]}'
    );
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "move my stuff" }],
        level: "auto",
        deps: depsWith({ updateTask: update })
      },
      { generateChat }
    );
    expect(generateChat).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(res.reply).toContain("Which day did you mean?");
    expect(res.reply).toContain("Today");
    expect(res.toolCalls).toHaveLength(0);
  });

  it("runs an execute_program call that drives a write tool in auto mode", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const replies = [
      '{"tool_calls":[{"name":"execute_program","args":{"code":"await update_task({task_id:\\"t1\\", planned_start_time:\\"09:30\\"}); return \\"done\\";"}}]}',
      "Shifted it via a program."
    ];
    let i = 0;
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "shift report" }],
        level: "auto",
        deps: depsWith({ updateTask: update })
      },
      { generateChat: vi.fn(async () => replies[i++]) }
    );
    expect(update).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(res.reply).toContain("via a program");
    expect(res.toolCalls.find((call) => call.name === "update_task")?.status).toBe("executed");
  });

  it("allows execute_program to process large task rename batches", async () => {
    const tasks = Array.from({ length: 65 }, (_, index) =>
      task({ id: `t${index + 1}`, title: `タスク ${index + 1}` })
    );
    const update = vi.fn(async () => ({ ok: true }));
    const code = `
      const tasks = await list_tasks({ scope: "all" });
      for (const t of tasks.data) {
        await update_task({ task_id: t.id, title: "Task " + t.id.slice(1) });
      }
      return "renamed " + tasks.data.length;
    `;
    const replies = [
      JSON.stringify({ tool_calls: [{ name: "execute_program", args: { code } }] }),
      "Renamed the tasks."
    ];
    let i = 0;

    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "rename all tasks to English" }],
        level: "auto",
        deps: depsWith({ updateTask: update, tasks })
      },
      { generateChat: vi.fn(async () => replies[i++]) }
    );

    expect(update).toHaveBeenCalledTimes(65);
    expect(res.toolCalls.filter((call) => call.name === "update_task")).toHaveLength(65);
    expect(res.reply).toContain("Renamed");
  });

  it("can repeat yesterday's tasks by reading a past date and creating today's copies", async () => {
    const tasks = [
      task({ id: "t1", title: "Yesterday A", due_date: "2026-06-22", planned_start_time: "09:00", planned_end_time: "10:00" }),
      task({ id: "t2", title: "Yesterday B", due_date: "2026-06-22", planned_start_time: null, planned_end_time: null }),
      task({ id: "t3", title: "Today", due_date: "2026-06-23" })
    ];
    const create = vi.fn(async () => ({ ok: true, id: "created" }));
    const code = `
      const y = await list_tasks({ due_date: "yesterday" });
      for (const t of y.data) {
        const args = {
          title: t.title,
          description: t.description,
          priority: t.priority,
          due_date: "today"
        };
        if (t.category_id) args.category = t.category_id;
        if (t.estimated_minutes != null) args.estimated_minutes = t.estimated_minutes;
        await create_task(args);
      }
      return "created " + y.data.length;
    `;
    const replies = [
      JSON.stringify({ tool_calls: [{ name: "execute_program", args: { code } }] }),
      "Repeated yesterday's tasks for today."
    ];
    let i = 0;

    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "repeat all of yesterday's tasks" }],
        level: "auto",
        deps: depsWith({ createTask: create, tasks })
      },
      { generateChat: vi.fn(async () => replies[i++]) }
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, expect.objectContaining({ title: "Yesterday A", due_date: "2026-06-23" }));
    expect(create).toHaveBeenNthCalledWith(2, expect.objectContaining({ title: "Yesterday B", due_date: "2026-06-23" }));
    expect(res.toolCalls.filter((call) => call.name === "create_task")).toHaveLength(2);
    expect(res.reply).toContain("Repeated");
  });

  it("defers program-driven writes to pending in ask mode", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const replies = [
      '{"tool_calls":[{"name":"execute_program","args":{"code":"await update_task({task_id:\\"t1\\", planned_start_time:\\"09:30\\"}); return \\"queued\\";"}}]}',
      "Proposed via program."
    ];
    let i = 0;
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "shift report" }],
        level: "ask",
        deps: depsWith({ updateTask: update })
      },
      { generateChat: vi.fn(async () => replies[i++]) }
    );
    expect(update).not.toHaveBeenCalled();
    expect(res.toolCalls.find((call) => call.name === "update_task")?.status).toBe("pending");
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

  it("ask mode fails an unresolvable task_id back to the model instead of queueing it (AI-TOOL-QUEUE-01)", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const replies = [
      '{"tool_calls":[{"name":"update_task","args":{"task_id":"task_deadbeef-0000-4000-8000-000000000000","planned_start_time":"19:00"}}]}',
      "That id was stale."
    ];
    let i = 0;
    const generateChat = vi.fn(async (..._args: unknown[]) => replies[i++]);
    const res = await runToolLoop(
      {
        system: "s",
        messages: [{ role: "user", content: "move it to 7pm" }],
        level: "ask",
        deps: depsWith({ updateTask: update })
      },
      { generateChat }
    );
    expect(update).not.toHaveBeenCalled();
    const record = res.toolCalls.find((call) => call.name === "update_task");
    expect(record?.status).toBe("failed");
    expect(record?.error).toContain("Unknown task_id");
    // The model must see the failure in-loop so it can correct the id now,
    // not after the user clicks Apply.
    const followUp = generateChat.mock.calls[1]?.[1] as unknown as { messages: { content: string }[] };
    expect(followUp.messages.at(-1)?.content).toContain("FAILED");
  });

  it("ask mode queues a write whose short task_id resolves", async () => {
    const uuidTask = task({ id: "task_e41f3a2b-1111-4222-8333-444455556666", title: "Mock Interview" });
    const update = vi.fn(async () => ({ ok: true }));
    const replies = [
      '{"tool_calls":[{"name":"update_task","args":{"task_id":"task_e41f3a2b","planned_start_time":"19:00"}}]}',
      "Proposed."
    ];
    let i = 0;
    const res = await runToolLoop(
      {
        system: "s",
        messages: [{ role: "user", content: "move it to 7pm" }],
        level: "ask",
        deps: depsWith({ updateTask: update, tasks: [uuidTask] })
      },
      { generateChat: vi.fn(async () => replies[i++]) }
    );
    expect(update).not.toHaveBeenCalled();
    const record = res.toolCalls.find((call) => call.name === "update_task");
    expect(record?.status).toBe("pending");
    expect(record?.summary).toContain("Mock Interview");
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

  it("does not execute writes when the signal aborts during generation", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const controller = new AbortController();
    // First call yields a write, but the user aborts before we act on it.
    const generateChat = vi.fn(async () => {
      controller.abort();
      return '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}';
    });
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "shift it" }],
        level: "auto",
        deps: depsWith({ updateTask: update }),
        signal: controller.signal
      },
      { generateChat }
    );
    expect(update).not.toHaveBeenCalled();
    expect(res.toolCalls).toHaveLength(0);
  });

  it("queues an auto-mode drop routed via update_task for confirmation instead of executing it", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const drop = vi.fn(async () => ({ ok: true }));
    const replies = [
      '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","status":"dropped"}}]}',
      "Want me to drop it?"
    ];
    let i = 0;
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "ditch the report" }],
        level: "auto",
        deps: depsWith({ updateTask: update }) as never
      },
      { generateChat: vi.fn(async () => replies[i++]) }
    );
    // Destructive status change must not slip through auto mode unconfirmed.
    expect(drop).not.toHaveBeenCalled();
    const rec = res.toolCalls.find((call) => call.name === "update_task");
    expect(rec?.status).toBe("pending");
    expect(rec?.destructive).toBe(true);
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

  it("replays native tool calls as structured turns with paired results", async () => {
    const inputs: import("../providers").ChatInput[] = [];
    let call = 0;
    const v2 = async (_s: unknown, input: import("../providers").ChatInput) => {
      inputs.push(input);
      return call++ === 0
        ? { text: "Checking.", toolCalls: [{ name: "list_tasks", args: { scope: "today" }, id: "toolu_9" }] }
        : { text: "Done.", toolCalls: [] };
    };
    await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "what's on today?" }],
        level: "auto",
        deps: depsWith()
      },
      { generateChatV2: v2 as never }
    );
    const second = inputs[1].messages;
    expect(second).toHaveLength(3);
    expect(second[1].role).toBe("assistant");
    expect(second[1].content).toBe("Checking.");
    expect(second[1].toolCalls).toEqual([{ id: "toolu_9", name: "list_tasks", args: { scope: "today" } }]);
    expect(second[2].role).toBe("user");
    expect(second[2].toolResults?.[0].id).toBe("toolu_9");
    expect(second[2].toolResults?.[0].content).toContain("list_tasks");
  });

  it("synthesizes call ids for native calls without provider ids (Gemini)", async () => {
    const inputs: import("../providers").ChatInput[] = [];
    let call = 0;
    const v2 = async (_s: unknown, input: import("../providers").ChatInput) => {
      inputs.push(input);
      return call++ === 0
        ? { text: "", toolCalls: [{ name: "list_tasks", args: { scope: "today" } }] }
        : { text: "Done.", toolCalls: [] };
    };
    await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "x" }],
        level: "auto",
        deps: depsWith()
      },
      { generateChatV2: v2 as never }
    );
    const second = inputs[1].messages;
    const callId = second[1].toolCalls?.[0].id;
    expect(callId).toBeTruthy();
    expect(second[2].toolResults?.[0].id).toBe(callId);
  });

  it("propagates a provider error when nothing was executed or queued yet", async () => {
    const generateChat = vi.fn(async () => {
      throw new Error("The AI provider rejected your API key — check it in Settings → AI");
    });
    await expect(
      runToolLoop(
        {
          system: "sys",
          messages: [{ role: "user", content: "hi" }],
          level: "auto",
          deps: depsWith()
        },
        { generateChat }
      )
    ).rejects.toThrow(/rejected your API key/i);
    // No retry storm: the loop must not keep calling a failing provider.
    expect(generateChat).toHaveBeenCalledTimes(1);
  });

  it("surfaces already-executed writes when the provider fails mid-loop", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const replies: Array<() => string> = [
      () => '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}',
      () => {
        throw new Error("HTTP 500");
      },
      () => "I moved the report, but then lost the connection."
    ];
    let i = 0;
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "shift it" }],
        level: "auto",
        deps: depsWith({ updateTask: update })
      },
      { generateChat: vi.fn(async () => replies[i++]()) }
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(res.toolCalls.find((call) => call.name === "update_task")?.status).toBe("executed");
    expect(res.reply).toContain("moved the report");
  });

  it("still returns executed writes when the final fallback also fails", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const replies: Array<() => string> = [
      () => '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}',
      () => {
        throw new Error("HTTP 500");
      },
      () => {
        throw new Error("HTTP 500");
      }
    ];
    let i = 0;
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "shift it" }],
        level: "auto",
        deps: depsWith({ updateTask: update })
      },
      { generateChat: vi.fn(async () => replies[i++]()) }
    );
    expect(res.toolCalls.find((call) => call.name === "update_task")?.status).toBe("executed");
    expect(res.reply).toBe("");
  });

  it("does not execute tool calls from a truncated response and asks the model to re-issue", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const inputs: import("../providers").ChatInput[] = [];
    let call = 0;
    const v2 = async (_s: unknown, input: import("../providers").ChatInput) => {
      inputs.push(input);
      return call++ === 0
        ? {
            text: "",
            toolCalls: [{ name: "update_task", args: { task_id: "t1", planned_start_time: "09:30" }, id: "c1" }],
            truncated: true
          }
        : { text: "Done properly this time.", toolCalls: [] };
    };
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "shift it" }],
        level: "auto",
        deps: depsWith({ updateTask: update })
      },
      { generateChatV2: v2 as never }
    );
    expect(update).not.toHaveBeenCalled();
    expect(res.toolCalls).toHaveLength(0);
    expect(inputs[1].messages.at(-1)?.toolResults?.[0].content).toMatch(/cut off|truncated/i);
    expect(res.reply).toContain("Done properly");
  });

  it("refuses to execute calls whose streamed args did not parse (argsInvalid)", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const inputs: import("../providers").ChatInput[] = [];
    let call = 0;
    const v2 = async (_s: unknown, input: import("../providers").ChatInput) => {
      inputs.push(input);
      return call++ === 0
        ? {
            text: "",
            // e.g. a garbled stream: args arrived as unparseable JSON → {}. For
            // all-optional tools {} would validate and run with defaults.
            toolCalls: [{ name: "update_task", args: {}, id: "c1", argsInvalid: true }]
          }
        : { text: "Let me retry.", toolCalls: [] };
    };
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "shift it" }],
        level: "auto",
        deps: depsWith({ updateTask: update })
      },
      { generateChatV2: v2 as never }
    );
    expect(update).not.toHaveBeenCalled();
    expect(res.toolCalls).toHaveLength(0);
    expect(inputs[1].messages.at(-1)?.toolResults?.[0].content).toMatch(/not valid JSON/i);
  });

  it("sends a raised output-token budget on tool turns", async () => {
    const generateChat = vi.fn(async () => "Done.");
    await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "x" }],
        level: "auto",
        deps: depsWith()
      },
      { generateChat }
    );
    const firstInput = (generateChat.mock.calls[0] as unknown[])[1] as { maxTokens?: number };
    expect(firstInput.maxTokens).toBeGreaterThanOrEqual(4096);
  });

  it("keeps the JSON text emulation for providers without native tool calling", async () => {
    const seen: import("../providers").ChatInput[] = [];
    const replies = [
      '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}}]}',
      "All set."
    ];
    let i = 0;
    const generateChat = vi.fn(async (_s: unknown, input: import("../providers").ChatInput) => {
      seen.push(input);
      return replies[i++];
    });
    await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "x" }],
        level: "auto",
        deps: depsWith()
      },
      { generateChat: generateChat as never }
    );
    const second = seen[1].messages;
    expect(second[1].toolCalls).toBeUndefined();
    expect(second[2].content).toContain("Tool results:");
    expect(second[2].toolResults).toBeUndefined();
  });
});
