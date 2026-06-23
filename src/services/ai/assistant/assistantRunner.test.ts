import { describe, expect, it, vi } from "vitest";
import { runAssistantToolTurn, runAssistantTurn, runAssistantTurnStreaming } from "./assistantRunner";
import type { AssistantStoreSnapshot } from "./contextBuilder";
import type { ChatTurn } from "../providers";
import type { RetrospectiveInsights } from "../../retrospect/types";
import type { Task } from "../../../types";

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-18",
  tasks: [],
  backlogTasks: [],
  categories: [{ id: "c1", name: "Deep Work" } as never],
  allTasks: []
};

const settings = { aiProvider: "anthropic" as const, aiApiKey: "k", aiModel: "", aiBaseUrl: "" };

describe("runAssistantTurn", () => {
  it("builds context, calls generateChat with system + messages, parses result", async () => {
    const generateChat = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ reply: "Done", actions: [] }));
    const messages: ChatTurn[] = [{ role: "user", content: "hi" }];

    const result = await runAssistantTurn(
      { settings, snapshot, messages },
      { generateChat }
    );

    expect(generateChat).toHaveBeenCalledTimes(1);
    const callArg = generateChat.mock.calls[0][1];
    expect(callArg.system).toContain("Yolo Assistant");
    expect(callArg.messages).toEqual(messages);
    expect(result.reply).toBe("Done");
  });

  it("passes retrospective insights into the system prompt", async () => {
    const insightsFixture: RetrospectiveInsights = {
      windowDays: 30,
      hasData: true,
      calibration: {
        overall: { scope: "overall", estimatedMinutes: 60, actualMinutes: 90, ratio: 1.5, sampleSize: 6, confidence: "ok" },
        byCategory: []
      },
      slips: { items: [], moreCount: 0, blockerThemes: [] },
      weekly: {
        thisWeekMinutes: 0,
        lastWeekMinutes: 0,
        deltaMinutes: 0,
        categoryDeltas: [],
        completedCount: 0,
        droppedCount: 0
      }
    };

    let capturedSystem = "";
    const generateChat = vi.fn(async (_settings, input) => {
      capturedSystem = input.system;
      return JSON.stringify({ reply: "ok", actions: [] });
    });

    await runAssistantTurn(
      {
        settings: {} as never,
        snapshot: { selectedDate: "2026-06-19", tasks: [], backlogTasks: [], categories: [], allTasks: [] },
        messages: [{ role: "user", content: "how was my week?" }],
        insights: insightsFixture
      },
      { generateChat }
    );

    expect(capturedSystem).toContain("History & patterns");
  });
});

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Report",
    description: null,
    status: "todo",
    priority: "medium",
    category_id: null,
    estimated_minutes: null,
    due_date: "2026-06-18",
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    template_id: null,
    created_at: "2026-06-18T09:00:00Z",
    updated_at: "u0",
    completed_at: null,
    dropped_at: null,
    ...overrides
  };
}

describe("runAssistantToolTurn", () => {
  it("builds the tool prompt and executes reversible writes in auto mode", async () => {
    const tasks = [taskFixture()];
    const updateTask = vi.fn(async () => ({ ok: true }));
    const generateChat = vi
      .fn()
      .mockResolvedValueOnce('{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}')
      .mockResolvedValueOnce("Done.");

    const result = await runAssistantToolTurn(
      {
        settings,
        snapshot: { ...snapshot, allTasks: tasks, tasks, permissionLevel: "auto" },
        messages: [{ role: "user", content: "move report to 9:30" }]
      },
      {
        generateChat,
        store: {
          getAllTasks: () => tasks,
          getCategories: () => [],
          updateTask,
          createTask: vi.fn(),
          deleteTask: vi.fn(),
          startTask: vi.fn(),
          pauseActiveTask: vi.fn(),
          completeTask: vi.fn(),
          dropTask: vi.fn(),
          moveTaskToBacklog: vi.fn(),
          ensureCategory: vi.fn(),
          refresh: vi.fn()
        }
      }
    );

    expect(generateChat.mock.calls[0][1].system).toContain("tool_calls");
    expect(updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(result.reply).toBe("Done.");
    expect(result.toolCalls[0]).toMatchObject({ name: "update_task", status: "executed" });
  });

  it("uses the snapshot permission level to queue writes in ask mode", async () => {
    const tasks = [taskFixture()];
    const updateTask = vi.fn(async () => ({ ok: true }));
    const generateChat = vi
      .fn()
      .mockResolvedValueOnce('{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}')
      .mockResolvedValueOnce("Queued.");

    const result = await runAssistantToolTurn(
      {
        settings,
        snapshot: { ...snapshot, allTasks: tasks, tasks, permissionLevel: "ask" },
        messages: [{ role: "user", content: "move report" }]
      },
      {
        generateChat,
        store: {
          getAllTasks: () => tasks,
          getCategories: () => [],
          updateTask,
          createTask: vi.fn(),
          deleteTask: vi.fn(),
          startTask: vi.fn(),
          pauseActiveTask: vi.fn(),
          completeTask: vi.fn(),
          dropTask: vi.fn(),
          moveTaskToBacklog: vi.fn(),
          ensureCategory: vi.fn(),
          refresh: vi.fn()
        }
      }
    );

    expect(updateTask).not.toHaveBeenCalled();
    expect(result.toolCalls[0]).toMatchObject({ name: "update_task", status: "pending" });
  });
});

describe("runAssistantTurnStreaming", () => {
  it("streams a buffered lookup round (no UI tokens) then a live final: step → token → actions → done", async () => {
    const generateChat = vi.fn();
    const streamChat = vi.fn(async (_settings, _input, cb) => {
      // First call: the lookup round (JSON protocol → buffered, never reaches UI).
      // Second call: the markdown final, streamed live.
      if (streamChat.mock.calls.length === 1) {
        cb?.onToken?.('{ "lookups": ');
        cb?.onToken?.('[{ "tool": "search_tasks", "query": "x" }] }');
        return '{ "lookups": [{ "tool": "search_tasks", "query": "x" }] }';
      }
      cb?.onToken?.("Hel");
      cb?.onToken?.("lo");
      return "Hello\n\n```json\n[]\n```";
    });

    const order: string[] = [];
    const steps: string[] = [];
    const tokens: string[] = [];

    await runAssistantTurnStreaming(
      { settings, snapshot, messages: [{ role: "user", content: "hi" }] },
      {
        onStep: (l) => { steps.push(l); order.push("step"); },
        onToken: (c) => { tokens.push(c); order.push("token"); },
        onActions: () => order.push("actions"),
        onDone: () => order.push("done")
      },
      { generateChat, streamChat }
    );

    expect(generateChat).not.toHaveBeenCalled(); // lookups now streamed, not non-streamed
    expect(streamChat).toHaveBeenCalledTimes(2);
    expect(steps).toContain("Scanning your existing tasks…");
    // No tokens leaked from the buffered lookup round.
    expect(tokens.join("")).toBe("Hello");
    expect(order).toEqual(["step", "token", "token", "actions", "done"]);
  });

  it("streams immediately when the first turn is a markdown final (no lookups)", async () => {
    const generateChat = vi.fn();
    const streamChat = vi.fn(async (_s, _i, cb) => {
      cb?.onToken?.("Hi");
      return "Hi\n\n```json\n[]\n```";
    });
    const tokens: string[] = [];
    let doneReply = "";

    await runAssistantTurnStreaming(
      { settings, snapshot, messages: [{ role: "user", content: "hi" }] },
      { onToken: (c) => tokens.push(c), onDone: (r) => { doneReply = r; } },
      { generateChat, streamChat }
    );

    expect(generateChat).not.toHaveBeenCalled();
    expect(streamChat).toHaveBeenCalledTimes(1);
    expect(tokens).toEqual(["Hi"]);
    expect(doneReply).toBe("Hi");
  });

  it("parses fenced actions from the streamed text and forwards them via onActions", async () => {
    const generateChat = vi.fn();
    const streamChat = vi.fn(async (_s, _i, cb) => {
      cb?.onToken?.("Here is your plan. ");
      return 'Here is your plan.\n\n```json\n[{ "type": "create_task", "title": "X", "due_date": "today" }]\n```';
    });

    let actions: { type: string }[] = [];
    let doneReply = "";
    await runAssistantTurnStreaming(
      { settings, snapshot, messages: [{ role: "user", content: "plan" }] },
      { onActions: (a) => { actions = a; }, onDone: (r) => { doneReply = r; } },
      { generateChat, streamChat }
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("create_task");
    expect(doneReply).toBe("Here is your plan.");
  });

  it("suppresses the trailing ```json fence from the live token stream", async () => {
    const generateChat = vi.fn();
    const streamChat = vi.fn(async (_s, _i, cb) => {
      cb?.onToken?.("Here is your plan.\n\n");
      cb?.onToken?.("```json\n[]\n```");
      return 'Here is your plan.\n\n```json\n[]\n```';
    });
    const tokens: string[] = [];
    let doneReply = "";

    await runAssistantTurnStreaming(
      { settings, snapshot, messages: [{ role: "user", content: "plan" }] },
      { onToken: (c) => tokens.push(c), onDone: (r) => { doneReply = r; } },
      { generateChat, streamChat }
    );

    expect(tokens.join("")).toBe("Here is your plan.\n\n"); // fence never reaches the UI
    expect(doneReply).toBe("Here is your plan.");
  });

  it("aborts mid-stream: onDone is called with the accumulated partial", async () => {
    const generateChat = vi.fn();
    const streamChat = vi.fn(async (_s, _i, cb) => {
      cb?.onToken?.("Hel");
      return "Hel"; // simulate the transport returning the partial on abort
    });
    const ac = new AbortController();
    ac.abort();

    let doneReply = "";
    await runAssistantTurnStreaming(
      { settings, snapshot, messages: [{ role: "user", content: "hi" }] },
      { onToken: () => {}, onDone: (r) => { doneReply = r; }, signal: ac.signal },
      { generateChat, streamChat }
    );

    expect(doneReply).toBe("Hel");
  });

  it("rethrows non-abort errors from the transport", async () => {
    const generateChat = vi.fn();
    const streamChat = vi.fn(async () => {
      throw new Error("provider down");
    });
    await expect(
      runAssistantTurnStreaming(
        { settings, snapshot, messages: [{ role: "user", content: "hi" }] },
        {},
        { generateChat, streamChat }
      )
    ).rejects.toThrow("provider down");
  });

  it("falls back to a non-streamed final when the step budget is exhausted", async () => {
    // Every streamed turn returns a lookups request → the loop exhausts MAX_STEPS.
    const streamChat = vi.fn(async (_s, _i, _cb) =>
      JSON.stringify({ lookups: [{ tool: "search_tasks", query: "x" }] })
    );
    const generateChat = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ reply: "forced final", actions: [] }));
    let doneReply = "";

    await runAssistantTurnStreaming(
      { settings, snapshot, messages: [{ role: "user", content: "loop" }] },
      { onDone: (r) => { doneReply = r; } },
      { generateChat, streamChat }
    );

    // MAX_STEPS streamed lookup rounds, then one non-streamed forced final.
    expect(streamChat.mock.calls.length).toBeLessThanOrEqual(6);
    expect(generateChat).toHaveBeenCalled();
    expect(typeof doneReply).toBe("string");
  });
});
