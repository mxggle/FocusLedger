import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ProposedAction } from "../services/ai/assistant/types";

const { runAssistantTurn, runAssistantTurnStreaming } = vi.hoisted(() => ({
  runAssistantTurn: vi.fn(),
  runAssistantTurnStreaming: vi.fn()
}));
vi.mock("../services/ai/assistant/assistantRunner", () => ({
  runAssistantTurn,
  runAssistantTurnStreaming
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
  tasks: [],
  backlogTasks: [],
  categories: [],
  allTasks: [],
  createTask: vi.fn().mockResolvedValue({ ok: true }),
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

vi.mock("./settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ settings: { aiProvider: "anthropic", aiApiKey: "k", aiModel: "", aiBaseUrl: "" } })
  }
}));

import { useAssistantStore } from "./assistantStore";
import { buildRetrospectiveInsights } from "../services/retrospect";

/** Let pending microtasks/macrotasks drain so the async send chain progresses. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Drive the streaming callbacks synchronously (awaiting the async store hooks). */
async function emit(
  cb: { onToken?: (c: string) => void; onActions?: (a: ProposedAction[]) => void; onDone?: (r: string) => void },
  tokens: string[],
  actions: ProposedAction[],
  reply: string
): Promise<void> {
  for (const t of tokens) cb.onToken?.(t);
  await cb.onActions?.(actions);
  await cb.onDone?.(reply);
}

beforeEach(() => {
  useAssistantStore.setState({
    messages: [],
    status: "idle",
    error: null,
    steps: [],
    streamingMessageId: null,
    insights: null,
    history: null
  });
  vi.clearAllMocks();
  runAssistantTurnStreaming.mockReset();
  taskState.createTask.mockResolvedValue({ ok: true });
  uiState.confirm.mockResolvedValue(true);
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
  it("appends user + assistant messages with proposed actions", async () => {
    runAssistantTurnStreaming.mockImplementation(async (_input, cb) => {
      await emit(cb, ["Here's a plan"], [{ id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "pending" }], "Here's a plan");
    });
    await useAssistantStore.getState().send("plan my day");
    const messages = useAssistantStore.getState().messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    // create_task is non-destructive → auto-applied during onActions
    expect(messages[1].actions?.[0].summary).toBe("Create X");
    expect(messages[1].actions?.[0].status).toBe("applied");
    expect(useAssistantStore.getState().status).toBe("idle");
  });

  it("records an error when the runner throws", async () => {
    runAssistantTurnStreaming.mockRejectedValue(new Error("no key"));
    await useAssistantStore.getState().send("hi");
    expect(useAssistantStore.getState().status).toBe("error");
    expect(useAssistantStore.getState().error).toContain("no key");
  });
});

describe("assistantStore streaming", () => {
  it("first token appends a placeholder assistant message and sets streaming status", async () => {
    let proceed = () => {};
    runAssistantTurnStreaming.mockImplementation(async (_input, cb) => {
      cb.onToken?.("Hel");
      await new Promise<void>((r) => { proceed = r; });
      await emit(cb, [], [], "Hel");
    });
    const sendPromise = useAssistantStore.getState().send("hi");
    await flush();

    const state = useAssistantStore.getState();
    expect(state.status).toBe("streaming");
    expect(state.streamingMessageId).not.toBeNull();
    expect(state.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(state.messages[1].content).toBe("Hel");

    proceed();
    await sendPromise;
  });

  it("accumulates subsequent tokens into the streaming message content", async () => {
    let proceed = () => {};
    runAssistantTurnStreaming.mockImplementation(async (_input, cb) => {
      cb.onToken?.("Hel");
      cb.onToken?.("lo");
      cb.onToken?.("!");
      await new Promise<void>((r) => { proceed = r; });
      await emit(cb, [], [], "Hello!");
    });
    const sendPromise = useAssistantStore.getState().send("hi");
    await flush();

    expect(useAssistantStore.getState().messages[1].content).toBe("Hello!");

    proceed();
    await sendPromise;
  });

  it("onDone sets status idle, clears streamingMessageId and steps, and persists", async () => {
    runAssistantTurnStreaming.mockImplementation(async (_input, cb) => {
      await emit(cb, ["ok"], [], "ok");
    });
    await useAssistantStore.getState().send("remember this");
    const state = useAssistantStore.getState();
    expect(state.status).toBe("idle");
    expect(state.streamingMessageId).toBeNull();
    expect(state.steps).toEqual([]);
    expect(messageRepo.append).toHaveBeenCalledTimes(2); // user + assistant
    expect(messageRepo.append.mock.calls[0][0]).toMatchObject({ role: "user", content: "remember this" });
    expect(messageRepo.append.mock.calls[1][0]).toMatchObject({ role: "assistant", content: "ok" });
  });

  it("stop keeps the partial, marks the message stopped, and goes idle", async () => {
    let proceed = () => {};
    runAssistantTurnStreaming.mockImplementation(async (_input, cb) => {
      cb.onToken?.("Hel");
      cb.onToken?.("lo");
      await new Promise<void>((r) => { proceed = r; });
      // After abort the transport returns the accumulated partial.
      await cb.onActions?.([]);
      await cb.onDone?.("Hello");
    });
    const sendPromise = useAssistantStore.getState().send("plan my day");
    await flush();

    expect(useAssistantStore.getState().status).toBe("streaming");
    useAssistantStore.getState().stop();
    proceed();
    await sendPromise;

    const state = useAssistantStore.getState();
    expect(state.status).toBe("idle");
    expect(state.streamingMessageId).toBeNull();
    const msg = state.messages[1];
    expect(msg.stopped).toBe(true);
    expect(msg.content).toBe("Hello");
    // partial is persisted
    expect(messageRepo.append).toHaveBeenCalled();
  });
});

describe("assistantStore.applyAction", () => {
  it("executes the action and marks it applied, refreshing tasks", async () => {
    useAssistantStore.setState({
      messages: [{ id: "m1", role: "assistant", content: "ok", createdAt: "2026-06-20T10:00:00Z", actions: [{ id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "pending" }] }],
      status: "idle"
    });
    await useAssistantStore.getState().applyAction("m1", "a1");
    expect(taskState.createTask).toHaveBeenCalledWith({ title: "X" });
    expect(taskState.refresh).toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[0].actions?.[0].status).toBe("applied");
  });

  it("marks the action failed and toasts when the store method throws", async () => {
    taskState.createTask.mockRejectedValue(new Error("boom"));
    useAssistantStore.setState({
      messages: [{ id: "m1", role: "assistant", content: "ok", createdAt: "2026-06-20T10:00:00Z", actions: [{ id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "pending" }] }],
      status: "idle"
    });
    await useAssistantStore.getState().applyAction("m1", "a1");
    const failed = useAssistantStore.getState().messages[0].actions?.[0];
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("boom");
    expect(uiState.addToast).toHaveBeenCalled();
  });

  it("confirms before a destructive action and marks failed on error", async () => {
    taskState.dropTask = vi.fn().mockResolvedValue({ ok: false, message: "nope" });
    useAssistantStore.setState({
      messages: [{ id: "m1", role: "assistant", content: "ok", createdAt: "2026-06-20T10:00:00Z", actions: [{ id: "d1", type: "drop_task", params: { task_id: "t1", title: "T" }, summary: "Drop T", destructive: true, status: "pending" }] }],
      status: "idle"
    });
    await useAssistantStore.getState().applyAction("m1", "d1");
    expect(uiState.confirm).toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[0].actions?.[0].status).toBe("failed");
  });
});

describe("assistantStore.updateActionParams", () => {
  it("merges edited params and recomputes the summary", async () => {
    useAssistantStore.setState({
      messages: [{ id: "m1", role: "assistant", content: "ok", createdAt: "2026-06-20T10:00:00Z", actions: [{ id: "a1", type: "create_task", params: { title: "X", due_date: null }, summary: "Create X in backlog", destructive: false, status: "pending" }] }],
      status: "idle"
    });
    useAssistantStore.getState().updateActionParams("m1", "a1", { title: "Launch", due_date: "2026-06-20" });
    const action = useAssistantStore.getState().messages[0].actions?.[0];
    expect(action?.params).toMatchObject({ title: "Launch", due_date: "2026-06-20" });
    expect(action?.summary).toBe('Create task "Launch" for 2026-06-20');
  });

  it("ignores edits to a non-pending action", async () => {
    useAssistantStore.setState({
      messages: [{ id: "m1", role: "assistant", content: "ok", createdAt: "2026-06-20T10:00:00Z", actions: [{ id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "applied" }] }],
      status: "idle"
    });
    useAssistantStore.getState().updateActionParams("m1", "a1", { title: "Changed" });
    expect(useAssistantStore.getState().messages[0].actions?.[0].params).toMatchObject({ title: "X" });
  });
});

describe("assistantStore regenerateLast / editUserMessage", () => {
  it("regenerateLast drops the trailing assistant message and re-runs", async () => {
    runAssistantTurnStreaming.mockImplementation(async (_input, cb) => {
      await emit(cb, ["Fresh"], [], "Fresh plan");
    });
    useAssistantStore.setState({
      messages: [
        { id: "u1", role: "user", content: "plan", createdAt: "2026-06-20T10:00:00Z" },
        { id: "a1", role: "assistant", content: "old plan", createdAt: "2026-06-20T10:00:01Z", actions: [] }
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

  it("regenerateLast does nothing when there is no assistant message", async () => {
    useAssistantStore.setState({
      messages: [{ id: "u1", role: "user", content: "plan", createdAt: "2026-06-20T10:00:00Z" }],
      status: "idle"
    });
    await useAssistantStore.getState().regenerateLast();
    expect(runAssistantTurnStreaming).not.toHaveBeenCalled();
  });

  it("editUserMessage drops everything after the edited turn and re-runs", async () => {
    runAssistantTurnStreaming.mockImplementation(async (_input, cb) => {
      await emit(cb, ["New"], [], "New answer");
    });
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
    expect(runAssistantTurnStreaming).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[0].content).toBe("keep");
  });
});

describe("assistantStore.insights", () => {
  it("loads insights once and forwards them to the runner", async () => {
    runAssistantTurnStreaming.mockImplementation(async (_input, cb) => {
      await emit(cb, ["ok"], [], "ok");
    });

    await useAssistantStore.getState().send("plan my day");
    await useAssistantStore.getState().send("and tomorrow?");

    expect(buildRetrospectiveInsights).toHaveBeenCalledTimes(1); // cached after first load
    const calls = runAssistantTurnStreaming.mock.calls;
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

describe("assistantStore persistence", () => {
  it("hydrate loads recent messages and downgrades stale pending actions", async () => {
    const rows: ChatMessage[] = [
      { id: "u1", role: "user", content: "earlier", createdAt: "2026-06-19T10:00:00Z" },
      {
        id: "m1",
        role: "assistant",
        content: "older plan",
        createdAt: "2026-06-19T10:00:01Z",
        actions: [{ id: "a1", type: "create_task", params: {}, summary: "S", destructive: false, status: "pending" }]
      }
    ];
    messageRepo.getRecent.mockResolvedValueOnce(rows);

    await useAssistantStore.getState().hydrate();

    const messages = useAssistantStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[1].actions?.[0].status).toBe("dismissed");
  });

  it("clear wipes the persisted history", () => {
    useAssistantStore.getState().clear();
    expect(messageRepo.clear).toHaveBeenCalled();
  });

  it("clear aborts any in-flight stream and resets streamingMessageId", async () => {
    let proceed = () => {};
    runAssistantTurnStreaming.mockImplementation(async (_input, cb) => {
      cb.onToken?.("Hel");
      await new Promise<void>((r) => { proceed = r; });
      await emit(cb, [], [], "Hel");
    });
    const sendPromise = useAssistantStore.getState().send("hi");
    await flush();
    expect(useAssistantStore.getState().streamingMessageId).not.toBeNull();

    useAssistantStore.getState().clear();
    expect(useAssistantStore.getState().streamingMessageId).toBeNull();
    expect(useAssistantStore.getState().messages).toEqual([]);

    proceed();
    await sendPromise;
  });
});
