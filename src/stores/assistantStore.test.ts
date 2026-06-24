import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../services/ai/assistant/types";
import type { ToolCallRecord, TaskUndoSnapshot } from "../services/ai/assistant/agentTools/types";
import type { Task } from "../types";

const { runAssistantToolTurn } = vi.hoisted(() => ({
  runAssistantToolTurn: vi.fn()
}));
vi.mock("../services/ai/assistant/assistantRunner", () => ({
  runAssistantToolTurn
}));

const { messageRepo } = vi.hoisted(() => ({
  messageRepo: {
    append: vi.fn((_message: ChatMessage): Promise<void> => Promise.resolve()),
    getRecent: vi.fn((_limit: number): Promise<ChatMessage[]> => Promise.resolve([])),
    clear: vi.fn((): Promise<void> => Promise.resolve()),
    deleteOne: vi.fn((_id: string): Promise<void> => Promise.resolve()),
    deleteAfter: vi.fn((_id: string): Promise<void> => Promise.resolve())
  }
}));
vi.mock("../db/assistantMessageRepository", () => ({ assistantMessageRepository: messageRepo }));

const { memoryRepo } = vi.hoisted(() => ({
  memoryRepo: {
    getActive: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
    getAll: vi.fn((): Promise<unknown[]> => Promise.resolve([]))
  }
}));
vi.mock("../db/assistantMemoryRepository", () => ({ assistantMemoryRepository: memoryRepo }));

const { reviewMock } = vi.hoisted(() => ({ reviewMock: { runMemoryReview: vi.fn(async (_input: { settings: { aiModel: string } }) => {}) } }));
vi.mock("../services/ai/assistant/memory/runMemoryReview", () => ({
  runMemoryReview: reviewMock.runMemoryReview,
  MEMORY_REVIEW_DEBOUNCE_MS: 0
}));

vi.mock("../services/ai/assistant/recallHistory", () => ({
  loadRecallEntries: vi.fn(async () => [])
}));

vi.mock("../services/retrospect", () => ({
  buildRetrospectiveInsights: vi.fn(async () => ({
    windowDays: 30,
    hasData: true,
    calibration: { overall: null, byCategory: [] },
    slips: { items: [], moreCount: 0, blockerThemes: [] },
    weekly: {
      thisWeekMinutes: 0,
      lastWeekMinutes: 0,
      deltaMinutes: 0,
      categoryDeltas: [],
      completedCount: 0,
      droppedCount: 0
    }
  }))
}));

const taskState = {
  selectedDate: "2026-06-18",
  tasks: [] as Task[],
  backlogTasks: [] as Task[],
  categories: [],
  allTasks: [] as Task[],
  createTask: vi.fn().mockResolvedValue({ ok: true }),
  updateTask: vi.fn().mockResolvedValue({ ok: true }),
  deleteTask: vi.fn().mockResolvedValue({ ok: true }),
  pauseActiveTask: vi.fn().mockResolvedValue({ ok: true }),
  rescheduleTask: vi.fn(), moveTaskToBacklog: vi.fn(), dropTask: vi.fn(),
  completeTask: vi.fn(), startTask: vi.fn(), ensureCategory: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined)
};
vi.mock("./taskStore", () => ({ useTaskStore: { getState: () => taskState } }));

const uiState = {
  addToast: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true)
};
vi.mock("./uiStore", () => ({ useUiStore: { getState: () => uiState } }));

const { settingsState } = vi.hoisted(() => ({
  settingsState: {
    aiProvider: "anthropic",
    aiApiKey: "k",
    aiModel: "",
    aiBaseUrl: "",
    assistantProfile: "",
    assistantName: "Yolo Assistant",
    assistantSoul: "",
    assistantPermissionLevel: "auto",
    assistantMemoryEnabled: false,
    assistantMemoryModel: "",
    dailyFocusTargetMinutes: 240
  }
}));
vi.mock("./settingsStore", () => ({
  useSettingsStore: { getState: () => ({ settings: settingsState }) }
}));

import { useAssistantStore } from "./assistantStore";
import { buildRetrospectiveInsights } from "../services/retrospect";

/** Let pending microtasks/macrotasks drain so the async send chain progresses. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Report",
    description: null,
    status: "todo",
    priority: "medium",
    category_id: null,
    estimated_minutes: null,
    due_date: "2026-06-20",
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    template_id: null,
    created_at: "2026-06-20T09:00:00Z",
    updated_at: "u0",
    completed_at: null,
    dropped_at: null,
    ...overrides
  };
}

function callFixture(overrides: Partial<ToolCallRecord> & { id: string; name: string }): ToolCallRecord {
  return {
    args: {},
    category: "write",
    destructive: false,
    summary: "S",
    status: "pending",
    ...overrides
  };
}

function assistantMessage(toolCalls: ToolCallRecord[], id = "m1"): ChatMessage {
  return {
    id,
    role: "assistant",
    content: "ok",
    createdAt: "2026-06-20T10:00:00Z",
    toolCalls
  };
}

const BEFORE_T1: TaskUndoSnapshot = {
  title: "Report",
  description: null,
  category_id: null,
  priority: "medium",
  estimated_minutes: null,
  due_date: "2026-06-20",
  planned_start_time: null,
  planned_end_time: null,
  status: "todo",
  updated_at: "u0"
};

beforeEach(() => {
  useAssistantStore.setState({
    messages: [],
    status: "idle",
    error: null,
    steps: [],
    streamingMessageId: null,
    insights: null,
    history: null,
    memories: null
  });
  vi.clearAllMocks();
  runAssistantToolTurn.mockReset();
  taskState.tasks = [];
  taskState.backlogTasks = [];
  taskState.categories = [];
  taskState.allTasks = [];
  taskState.createTask.mockResolvedValue({ ok: true });
  taskState.updateTask.mockResolvedValue({ ok: true });
  taskState.deleteTask.mockResolvedValue({ ok: true });
  taskState.refresh.mockResolvedValue(undefined);
  uiState.confirm.mockResolvedValue(true);
  settingsState.assistantMemoryEnabled = false;
  settingsState.assistantMemoryModel = "";
  settingsState.aiModel = "";
  // Deterministic, synchronous rAF so token buffering flushes immediately in tests.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assistantStore.send", () => {
  it("appends user + assistant messages with tool-call records", async () => {
    runAssistantToolTurn.mockResolvedValue({
      reply: "Here's a plan",
      toolCalls: [
        {
          id: "tc1",
          name: "create_task",
          args: { title: "X" },
          category: "write",
          destructive: false,
          summary: "Created X",
          status: "executed"
        }
      ]
    });
    await useAssistantStore.getState().send("plan my day");
    const messages = useAssistantStore.getState().messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1].toolCalls?.[0]).toMatchObject({ name: "create_task", status: "executed" });
    expect(taskState.refresh).toHaveBeenCalled();
    expect(useAssistantStore.getState().status).toBe("idle");
  });

  it("records an error when the runner throws", async () => {
    runAssistantToolTurn.mockRejectedValue(new Error("no key"));
    await useAssistantStore.getState().send("hi");
    expect(useAssistantStore.getState().status).toBe("error");
    expect(useAssistantStore.getState().error).toContain("no key");
  });

  it("does not mutate tasks when the provider returns an empty response", async () => {
    runAssistantToolTurn.mockRejectedValue(new Error("The AI provider returned an empty response"));
    await useAssistantStore.getState().send("hi");
    expect(useAssistantStore.getState().status).toBe("error");
    expect(useAssistantStore.getState().error).toContain("empty");
    expect(useAssistantStore.getState().messages.map((m) => m.role)).toEqual(["user"]);
    expect(taskState.createTask).not.toHaveBeenCalled();
    expect(taskState.updateTask).not.toHaveBeenCalled();
    expect(taskState.deleteTask).not.toHaveBeenCalled();
    expect(taskState.refresh).not.toHaveBeenCalled();
  });
});

describe("assistantStore tool turn", () => {
  it("stays thinking with only the user message while the tool runner is pending", async () => {
    let proceed = () => {};
    runAssistantToolTurn.mockImplementation(async () => {
      await new Promise<void>((r) => { proceed = r; });
      return { reply: "Done", toolCalls: [] };
    });
    const sendPromise = useAssistantStore.getState().send("hi");
    await flush();

    const state = useAssistantStore.getState();
    expect(state.status).toBe("thinking");
    expect(state.streamingMessageId).toBeNull();
    expect(state.messages.map((m) => m.role)).toEqual(["user"]);

    proceed();
    await sendPromise;
    expect(useAssistantStore.getState().messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("records runner steps and clears them when done", async () => {
    runAssistantToolTurn.mockImplementation(async (input) => {
      input.onStep?.("Looking up list_tasks...");
      return { reply: "Hello!", toolCalls: [] };
    });
    const sendPromise = useAssistantStore.getState().send("hi");
    await flush();

    await sendPromise;
    expect(useAssistantStore.getState().messages[1].content).toBe("Hello!");
    expect(useAssistantStore.getState().steps).toEqual([]);
  });

  it("sets status idle, clears streamingMessageId and steps, and persists", async () => {
    runAssistantToolTurn.mockResolvedValue({ reply: "ok", toolCalls: [] });
    await useAssistantStore.getState().send("remember this");
    const state = useAssistantStore.getState();
    expect(state.status).toBe("idle");
    expect(state.streamingMessageId).toBeNull();
    expect(state.steps).toEqual([]);
    expect(messageRepo.append).toHaveBeenCalledTimes(2); // user + assistant
    expect(messageRepo.append.mock.calls[0][0]).toMatchObject({ role: "user", content: "remember this" });
    expect(messageRepo.append.mock.calls[1][0]).toMatchObject({ role: "assistant", content: "ok" });
  });

  it("stop during a pending tool turn suppresses the assistant message", async () => {
    let proceed = () => {};
    runAssistantToolTurn.mockImplementation(async () => {
      await new Promise<void>((r) => { proceed = r; });
      return { reply: "Hello", toolCalls: [] };
    });
    const sendPromise = useAssistantStore.getState().send("plan my day");
    await flush();

    expect(useAssistantStore.getState().status).toBe("thinking");
    useAssistantStore.getState().stop();
    proceed();
    await sendPromise;

    const state = useAssistantStore.getState();
    expect(state.status).toBe("idle");
    expect(state.streamingMessageId).toBeNull();
    expect(state.messages.map((m) => m.role)).toEqual(["user"]);
  });

  it("AI-UI-06: stop suppresses the incomplete assistant turn but keeps prior history", async () => {
    useAssistantStore.setState({
      messages: [
        { id: "u0", role: "user", content: "earlier", createdAt: "2026-06-20T09:00:00Z" },
        { id: "a0", role: "assistant", content: "earlier plan", createdAt: "2026-06-20T09:00:01Z" }
      ],
      status: "idle"
    });
    let proceed = () => {};
    runAssistantToolTurn.mockImplementation(async () => {
      await new Promise<void>((r) => { proceed = r; });
      return { reply: "partial new plan", toolCalls: [] };
    });
    const sendPromise = useAssistantStore.getState().send("plan again");
    await flush();

    expect(useAssistantStore.getState().status).toBe("thinking");
    useAssistantStore.getState().stop();
    proceed();
    await sendPromise;

    const state = useAssistantStore.getState();
    expect(state.status).toBe("idle");
    expect(state.streamingMessageId).toBeNull();
    const roles = state.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user"]);
    expect(state.messages.at(-1)?.content).toBe("plan again");
    expect(state.messages.some((m) => m.content === "partial new plan")).toBe(false);
  });
});

describe("assistantStore tool calls", () => {
  it("applies a pending write tool call and records undo metadata", async () => {
    taskState.allTasks = [taskFixture()];
    useAssistantStore.setState({
      messages: [
        {
          id: "m1",
          role: "assistant",
          content: "ok",
          createdAt: "2026-06-20T10:00:00Z",
          toolCalls: [
            {
              id: "tc1",
              name: "update_task",
              args: { task_id: "t1", planned_start_time: "09:30" },
              category: "write",
              destructive: false,
              summary: "Move Report",
              status: "pending"
            }
          ]
        }
      ],
      status: "idle"
    });

    await useAssistantStore.getState().applyToolCall("m1", "tc1");

    expect(taskState.updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(taskState.refresh).toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[0].toolCalls?.[0]).toMatchObject({
      status: "executed",
      undo: { kind: "restore_task", taskId: "t1" }
    });
  });

  it("reverts an executed write tool call", async () => {
    taskState.allTasks = [taskFixture({ updated_at: "u1", planned_start_time: "09:30" })];
    useAssistantStore.setState({
      messages: [
        {
          id: "m1",
          role: "assistant",
          content: "ok",
          createdAt: "2026-06-20T10:00:00Z",
          toolCalls: [
            {
              id: "tc1",
              name: "update_task",
              args: { task_id: "t1", planned_start_time: "09:30" },
              category: "write",
              destructive: false,
              summary: "Moved Report",
              status: "executed",
              expectedUpdatedAt: "u1",
              undo: {
                kind: "restore_task",
                taskId: "t1",
                before: {
                  title: "Report",
                  description: null,
                  category_id: null,
                  priority: "medium",
                  estimated_minutes: null,
                  due_date: "2026-06-20",
                  planned_start_time: null,
                  planned_end_time: null,
                  status: "todo",
                  updated_at: "u0"
                }
              }
            }
          ]
        }
      ],
      status: "idle"
    });

    await useAssistantStore.getState().revertToolCall("m1", "tc1");

    expect(taskState.updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: null }));
    expect(taskState.refresh).toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[0].toolCalls?.[0].status).toBe("reverted");
  });

  it("can re-apply a reverted write tool call", async () => {
    taskState.allTasks = [taskFixture({ planned_start_time: null })];
    useAssistantStore.setState({
      messages: [
        {
          id: "m1",
          role: "assistant",
          content: "ok",
          createdAt: "2026-06-20T10:00:00Z",
          toolCalls: [
            {
              id: "tc1",
              name: "update_task",
              args: { task_id: "t1", planned_start_time: "09:30" },
              category: "write",
              destructive: false,
              summary: "Move Report",
              status: "reverted",
              undo: {
                kind: "restore_task",
                taskId: "t1",
                before: {
                  title: "Report",
                  description: null,
                  category_id: null,
                  priority: "medium",
                  estimated_minutes: null,
                  due_date: "2026-06-20",
                  planned_start_time: null,
                  planned_end_time: null,
                  status: "todo",
                  updated_at: "u0"
                }
              }
            }
          ]
        }
      ],
      status: "idle"
    });

    await useAssistantStore.getState().applyToolCall("m1", "tc1");

    expect(taskState.updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(useAssistantStore.getState().messages[0].toolCalls?.[0].status).toBe("executed");
  });

  it("can apply a dismissed write tool call", async () => {
    taskState.allTasks = [taskFixture()];
    useAssistantStore.setState({
      messages: [
        {
          id: "m1",
          role: "assistant",
          content: "ok",
          createdAt: "2026-06-20T10:00:00Z",
          toolCalls: [
            {
              id: "tc1",
              name: "update_task",
              args: { task_id: "t1", planned_start_time: "09:30" },
              category: "write",
              destructive: false,
              summary: "Move Report",
              status: "dismissed"
            }
          ]
        }
      ],
      status: "idle"
    });

    await useAssistantStore.getState().applyToolCall("m1", "tc1");

    expect(taskState.updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(useAssistantStore.getState().messages[0].toolCalls?.[0].status).toBe("executed");
  });
});

describe("assistantStore regenerateLast / editUserMessage", () => {
  it("regenerateLast drops the trailing assistant message and re-runs", async () => {
    runAssistantToolTurn.mockResolvedValue({ reply: "Fresh plan", toolCalls: [] });
    useAssistantStore.setState({
      messages: [
        { id: "u1", role: "user", content: "plan", createdAt: "2026-06-20T10:00:00Z" },
        { id: "a1", role: "assistant", content: "old plan", createdAt: "2026-06-20T10:00:01Z", toolCalls: [] }
      ],
      status: "idle"
    });

    await useAssistantStore.getState().regenerateLast();

    expect(messageRepo.deleteOne).toHaveBeenCalledWith("a1");
    const messages = useAssistantStore.getState().messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1].content).toBe("Fresh plan");
    expect(useAssistantStore.getState().status).toBe("idle");
  });

  it("AI-UI-08: regenerateLast reruns from the prior user turn (assistant message dropped before the runner)", async () => {
    runAssistantToolTurn.mockResolvedValue({ reply: "Fresh plan", toolCalls: [] });
    useAssistantStore.setState({
      messages: [
        { id: "u1", role: "user", content: "plan", createdAt: "2026-06-20T10:00:00Z" },
        { id: "a1", role: "assistant", content: "old plan", createdAt: "2026-06-20T10:00:01Z", toolCalls: [] }
      ],
      status: "idle"
    });

    await useAssistantStore.getState().regenerateLast();

    const lastCall = runAssistantToolTurn.mock.calls.at(-1);
    expect(lastCall).toBeTruthy();
    const runnerMessages = (lastCall![0] as { messages: { role: string; content: string }[] }).messages;
    expect(runnerMessages).toEqual([{ role: "user", content: "plan" }]);
    expect(runnerMessages.some((m) => m.role === "assistant")).toBe(false);
  });

  it("regenerateLast does nothing when there is no assistant message", async () => {
    useAssistantStore.setState({
      messages: [{ id: "u1", role: "user", content: "plan", createdAt: "2026-06-20T10:00:00Z" }],
      status: "idle"
    });
    await useAssistantStore.getState().regenerateLast();
    expect(runAssistantToolTurn).not.toHaveBeenCalled();
  });

  it("editUserMessage drops everything after the edited turn and re-runs", async () => {
    runAssistantToolTurn.mockResolvedValue({ reply: "New answer", toolCalls: [] });
    useAssistantStore.setState({
      messages: [
        { id: "u1", role: "user", content: "old question", createdAt: "2026-06-20T10:00:00Z" },
        { id: "a1", role: "assistant", content: "old answer", createdAt: "2026-06-20T10:00:01Z" },
        { id: "u2", role: "user", content: "follow up", createdAt: "2026-06-20T10:00:02Z" }
      ],
      status: "idle"
    });

    await useAssistantStore.getState().editUserMessage("u1", "edited question");

    expect(messageRepo.deleteAfter).toHaveBeenCalledWith("u1");
    expect(messageRepo.append).toHaveBeenCalledWith(expect.objectContaining({ id: "u1", content: "edited question" }));
    const messages = useAssistantStore.getState().messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[0].content).toBe("edited question");
    expect(messages[1].content).toBe("New answer");
  });

  it("editUserMessage ignores empty content", async () => {
    useAssistantStore.setState({
      messages: [{ id: "u1", role: "user", content: "keep", createdAt: "2026-06-20T10:00:00Z" }],
      status: "idle"
    });
    await useAssistantStore.getState().editUserMessage("u1", "   ");
    expect(runAssistantToolTurn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[0].content).toBe("keep");
  });
});

describe("assistantStore.insights", () => {
  it("loads insights once and forwards them to the runner", async () => {
    runAssistantToolTurn.mockResolvedValue({ reply: "ok", toolCalls: [] });

    await useAssistantStore.getState().send("plan my day");
    await useAssistantStore.getState().send("and tomorrow?");

    expect(buildRetrospectiveInsights).toHaveBeenCalledTimes(1); // cached after first load
    const calls = runAssistantToolTurn.mock.calls;
    const lastArg = calls[calls.length - 1][0];
    expect(lastArg.insights).not.toBeNull();
  });

  it("keeps insights when the conversation is cleared", () => {
    const cached = {
      windowDays: 30,
      hasData: true,
      calibration: { overall: null, byCategory: [] },
      slips: { items: [], moreCount: 0, blockerThemes: [] },
      weekly: { thisWeekMinutes: 0, lastWeekMinutes: 0, deltaMinutes: 0, categoryDeltas: [], completedCount: 0, droppedCount: 0 }
    };
    useAssistantStore.setState({ messages: [], status: "idle", error: null, insights: cached });

    useAssistantStore.getState().clear();

    expect(useAssistantStore.getState().messages).toEqual([]);
    expect(useAssistantStore.getState().insights).toBe(cached);
  });
});

describe("assistantStore.memories", () => {
  it("loadMemories caches active memories for the session", async () => {
    await useAssistantStore.getState().loadMemories();
    expect(memoryRepo.getActive).toHaveBeenCalledOnce();
    await useAssistantStore.getState().loadMemories();
    expect(memoryRepo.getActive).toHaveBeenCalledOnce(); // cached, not re-fetched
  });

  it("force-reload bypasses the cache", async () => {
    await useAssistantStore.getState().loadMemories();
    await useAssistantStore.getState().loadMemories(true);
    expect(memoryRepo.getActive).toHaveBeenCalledTimes(2);
  });
});

describe("assistantStore persistence", () => {
  it("hydrate loads recent messages and downgrades stale pending tool calls", async () => {
    const rows: ChatMessage[] = [
      { id: "u1", role: "user", content: "earlier", createdAt: "2026-06-19T10:00:00Z" },
      {
        id: "m1",
        role: "assistant",
        content: "older plan",
        createdAt: "2026-06-19T10:00:01Z",
        toolCalls: [
          {
            id: "tc1",
            name: "update_task",
            args: { task_id: "t1" },
            category: "write",
            destructive: false,
            summary: "S",
            status: "pending"
          }
        ]
      }
    ];
    messageRepo.getRecent.mockResolvedValueOnce(rows);

    await useAssistantStore.getState().hydrate();

    const messages = useAssistantStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[1].toolCalls?.[0].status).toBe("dismissed");
  });

  it("clear wipes the persisted history", () => {
    useAssistantStore.getState().clear();
    expect(messageRepo.clear).toHaveBeenCalled();
  });

  it("clear aborts any in-flight tool turn and keeps the conversation cleared", async () => {
    let proceed = () => {};
    runAssistantToolTurn.mockImplementation(async () => {
      await new Promise<void>((r) => { proceed = r; });
      return { reply: "Hel", toolCalls: [] };
    });
    const sendPromise = useAssistantStore.getState().send("hi");
    await flush();
    expect(useAssistantStore.getState().status).toBe("thinking");

    useAssistantStore.getState().clear();
    expect(useAssistantStore.getState().streamingMessageId).toBeNull();
    expect(useAssistantStore.getState().messages).toEqual([]);

    proceed();
    await sendPromise;
  });
});

describe("assistantStore approval, revert, reapply (AI-ACT)", () => {
  it("AI-ACT-02: dismissToolCall marks a pending call dismissed without mutating tasks", () => {
    useAssistantStore.setState({
      messages: [assistantMessage([callFixture({
        id: "tc1",
        name: "update_task",
        args: { task_id: "t1", planned_start_time: "09:30" },
        status: "pending"
      })])],
      status: "idle"
    });

    useAssistantStore.getState().dismissToolCall("m1", "tc1");

    expect(useAssistantStore.getState().messages[0].toolCalls?.[0].status).toBe("dismissed");
    expect(taskState.updateTask).not.toHaveBeenCalled();
    expect(taskState.deleteTask).not.toHaveBeenCalled();
    expect(taskState.refresh).not.toHaveBeenCalled();
  });

  it("AI-ACT-05: re-applying a reverted write tool call captures a fresh undo snapshot", async () => {
    taskState.allTasks = [taskFixture({ id: "t1", updated_at: "u2", planned_start_time: null })];
    useAssistantStore.setState({
      messages: [assistantMessage([callFixture({
        id: "tc1",
        name: "update_task",
        args: { task_id: "t1", planned_start_time: "09:30" },
        status: "reverted",
        undo: { kind: "restore_task", taskId: "t1", before: { ...BEFORE_T1, updated_at: "u0" } }
      })])],
      status: "idle"
    });

    await useAssistantStore.getState().applyToolCall("m1", "tc1");

    const call = useAssistantStore.getState().messages[0].toolCalls?.[0];
    expect(call?.status).toBe("executed");
    expect(call?.undo?.kind).toBe("restore_task");
    expect(call?.expectedUpdatedAt).toBe("u2");
    if (call?.undo?.kind === "restore_task") {
      expect(call.undo.before.updated_at).toBe("u2");
    }
  });

  it("AI-ACT-06: retrying a failed call succeeds and moves to Done", async () => {
    taskState.allTasks = [taskFixture({ id: "t1" })];
    taskState.updateTask.mockResolvedValue({ ok: true });
    useAssistantStore.setState({
      messages: [assistantMessage([callFixture({
        id: "tc1",
        name: "update_task",
        args: { task_id: "t1", planned_start_time: "09:30" },
        status: "failed",
        error: "old boom"
      })])],
      status: "idle"
    });

    await useAssistantStore.getState().applyToolCall("m1", "tc1");

    expect(taskState.updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(useAssistantStore.getState().messages[0].toolCalls?.[0].status).toBe("executed");
  });

  it("AI-ACT-06: retrying a failed call that fails again stays Failed with the latest error", async () => {
    taskState.allTasks = [taskFixture({ id: "t1" })];
    taskState.updateTask.mockResolvedValue({ ok: false, message: "new boom" });
    useAssistantStore.setState({
      messages: [assistantMessage([callFixture({
        id: "tc1",
        name: "update_task",
        args: { task_id: "t1", planned_start_time: "09:30" },
        status: "failed",
        error: "old boom"
      })])],
      status: "idle"
    });

    await useAssistantStore.getState().applyToolCall("m1", "tc1");

    const call = useAssistantStore.getState().messages[0].toolCalls?.[0];
    expect(call?.status).toBe("failed");
    expect(call?.error).toBe("new boom");
  });

  it("AI-ACT-07: requires confirmation before reverting when the task has drifted", async () => {
    taskState.allTasks = [taskFixture({ id: "t1", updated_at: "u9", planned_start_time: "09:30" })];
    useAssistantStore.setState({
      messages: [assistantMessage([callFixture({
        id: "tc1",
        name: "update_task",
        args: { task_id: "t1", planned_start_time: "09:30" },
        status: "executed",
        expectedUpdatedAt: "u0",
        undo: { kind: "restore_task", taskId: "t1", before: { ...BEFORE_T1, planned_start_time: null } }
      })])],
      status: "idle"
    });
    uiState.confirm.mockResolvedValue(true);

    await useAssistantStore.getState().revertToolCall("m1", "tc1");

    expect(uiState.confirm).toHaveBeenCalledOnce();
    expect(taskState.updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: null }));
    expect(taskState.refresh).toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[0].toolCalls?.[0].status).toBe("reverted");
  });

  it("AI-ACT-07: canceling drift confirmation leaves the executed action and task intact", async () => {
    taskState.allTasks = [taskFixture({ id: "t1", updated_at: "u9", planned_start_time: "09:30" })];
    useAssistantStore.setState({
      messages: [assistantMessage([callFixture({
        id: "tc1",
        name: "update_task",
        args: { task_id: "t1", planned_start_time: "09:30" },
        status: "executed",
        expectedUpdatedAt: "u0",
        undo: { kind: "restore_task", taskId: "t1", before: { ...BEFORE_T1, planned_start_time: null } }
      })])],
      status: "idle"
    });
    uiState.confirm.mockResolvedValue(false);

    await useAssistantStore.getState().revertToolCall("m1", "tc1");

    expect(uiState.confirm).toHaveBeenCalledOnce();
    expect(taskState.updateTask).not.toHaveBeenCalled();
    expect(taskState.refresh).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[0].toolCalls?.[0].status).toBe("executed");
  });

  it("AI-ACT-08: reverts a created task by deleting it; reapply creates a new task with a fresh undo id", async () => {
    taskState.createTask.mockResolvedValueOnce({ ok: true, id: "new2" });
    useAssistantStore.setState({
      messages: [assistantMessage([callFixture({
        id: "tc1",
        name: "create_task",
        args: { title: "Email Ken" },
        status: "executed",
        undo: { kind: "delete_task", taskId: "new1" }
      })])],
      status: "idle"
    });

    await useAssistantStore.getState().revertToolCall("m1", "tc1");
    expect(taskState.deleteTask).toHaveBeenCalledWith("new1");
    expect(useAssistantStore.getState().messages[0].toolCalls?.[0].status).toBe("reverted");

    await useAssistantStore.getState().applyToolCall("m1", "tc1");
    expect(taskState.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "Email Ken" }));
    const call = useAssistantStore.getState().messages[0].toolCalls?.[0];
    expect(call?.status).toBe("executed");
    expect(call?.undo?.kind).toBe("delete_task");
    if (call?.undo?.kind === "delete_task") {
      expect(call.undo.taskId).toBe("new2");
      expect(call.undo.taskId).not.toBe("new1");
    }
  });

  it("AI-ACT-09: hydrated pending tool calls downgrade to dismissed and remain re-applicable", async () => {
    taskState.allTasks = [taskFixture({ id: "t1" })];
    taskState.updateTask.mockResolvedValue({ ok: true });
    const rows: ChatMessage[] = [
      { id: "u1", role: "user", content: "earlier", createdAt: "2026-06-19T10:00:00Z" },
      assistantMessage(
        [callFixture({ id: "tc1", name: "update_task", args: { task_id: "t1", planned_start_time: "09:30" }, status: "pending" })],
        "m1"
      )
    ];
    messageRepo.getRecent.mockResolvedValueOnce(rows);

    await useAssistantStore.getState().hydrate();
    expect(useAssistantStore.getState().messages[1].toolCalls?.[0].status).toBe("dismissed");

    await useAssistantStore.getState().applyToolCall("m1", "tc1");
    expect(taskState.updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(useAssistantStore.getState().messages[1].toolCalls?.[0].status).toBe("executed");
  });

  it("AI-ACT-10: applies and reverts each tool card independently with no batch coupling", async () => {
    taskState.allTasks = [
      taskFixture({ id: "t1", title: "Report" }),
      taskFixture({ id: "t2", title: "Standup" })
    ];
    taskState.updateTask.mockResolvedValue({ ok: true });
    useAssistantStore.setState({
      messages: [assistantMessage([
        callFixture({ id: "tc1", name: "update_task", args: { task_id: "t1", planned_start_time: "09:30" }, status: "pending" }),
        callFixture({ id: "tc2", name: "update_task", args: { task_id: "t2", planned_start_time: "10:00" }, status: "pending" })
      ])],
      status: "idle"
    });

    await useAssistantStore.getState().applyToolCall("m1", "tc1");
    let calls = useAssistantStore.getState().messages[0].toolCalls!;
    expect(calls.find((c) => c.id === "tc1")?.status).toBe("executed");
    expect(calls.find((c) => c.id === "tc2")?.status).toBe("pending");
    expect(taskState.updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(taskState.updateTask).not.toHaveBeenCalledWith("t2", expect.objectContaining({ planned_start_time: "10:00" }));

    await useAssistantStore.getState().revertToolCall("m1", "tc1");
    calls = useAssistantStore.getState().messages[0].toolCalls!;
    expect(calls.find((c) => c.id === "tc1")?.status).toBe("reverted");
    expect(calls.find((c) => c.id === "tc2")?.status).toBe("pending");

    await useAssistantStore.getState().applyToolCall("m1", "tc2");
    calls = useAssistantStore.getState().messages[0].toolCalls!;
    expect(calls.find((c) => c.id === "tc2")?.status).toBe("executed");
    expect(calls.find((c) => c.id === "tc1")?.status).toBe("reverted");
  });
});

describe("assistantStore memory review scheduling (AI-MEM)", () => {
  it("AI-MEM-01: does not run a background memory review when memory is disabled", async () => {
    settingsState.assistantMemoryEnabled = false;
    runAssistantToolTurn.mockResolvedValue({ reply: "Noted.", toolCalls: [] });

    await useAssistantStore.getState().send("I always batch admin work on Fridays");
    await flush();
    await flush();

    expect(reviewMock.runMemoryReview).not.toHaveBeenCalled();
  });

  it("AI-MEM-10: reuses the assistant model when the memory model is empty", async () => {
    settingsState.assistantMemoryEnabled = true;
    settingsState.assistantMemoryModel = "";
    settingsState.aiModel = "claude-sonnet-4";
    runAssistantToolTurn.mockResolvedValue({ reply: "Got it, I'll remember that.", toolCalls: [] });

    await useAssistantStore.getState().send("I always batch admin work on Fridays");
    await flush();
    await flush();

    expect(reviewMock.runMemoryReview).toHaveBeenCalledOnce();
    expect(reviewMock.runMemoryReview.mock.calls[0]![0].settings.aiModel).toBe("claude-sonnet-4");
  });

  it("AI-MEM-10: uses the explicit memory model override when set", async () => {
    settingsState.assistantMemoryEnabled = true;
    settingsState.assistantMemoryModel = "gpt-4o-mini";
    settingsState.aiModel = "claude-sonnet-4";
    runAssistantToolTurn.mockResolvedValue({ reply: "Got it, I'll remember that.", toolCalls: [] });

    await useAssistantStore.getState().send("I always batch admin work on Fridays");
    await flush();
    await flush();

    expect(reviewMock.runMemoryReview).toHaveBeenCalledOnce();
    expect(reviewMock.runMemoryReview.mock.calls[0]![0].settings.aiModel).toBe("gpt-4o-mini");
  });
});
