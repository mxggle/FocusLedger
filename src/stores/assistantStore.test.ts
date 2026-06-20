import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../services/ai/assistant/types";

const { runAssistantTurn } = vi.hoisted(() => ({ runAssistantTurn: vi.fn() }));
vi.mock("../services/ai/assistant/assistantRunner", () => ({ runAssistantTurn }));

const { messageRepo } = vi.hoisted(() => ({
  messageRepo: {
    append: vi.fn((_message: ChatMessage): Promise<void> => Promise.resolve()),
    getRecent: vi.fn((_limit: number): Promise<ChatMessage[]> => Promise.resolve([])),
    clear: vi.fn((): Promise<void> => Promise.resolve())
  }
}));
vi.mock("../db/assistantMessageRepository", () => ({ assistantMessageRepository: messageRepo }));

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

beforeEach(() => {
  useAssistantStore.setState({ messages: [], status: "idle", error: null });
  vi.clearAllMocks();
  taskState.createTask.mockResolvedValue({ ok: true });
  uiState.confirm.mockResolvedValue(true);
});

describe("assistantStore.send", () => {
  it("appends user + assistant messages with proposed actions", async () => {
    runAssistantTurn.mockResolvedValue({
      reply: "Here's a plan",
      actions: [{ id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "pending" }]
    });
    await useAssistantStore.getState().send("plan my day");
    const messages = useAssistantStore.getState().messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1].actions?.[0].summary).toBe("Create X");
    expect(useAssistantStore.getState().status).toBe("idle");
  });

  it("records an error when the runner throws", async () => {
    runAssistantTurn.mockRejectedValue(new Error("no key"));
    await useAssistantStore.getState().send("hi");
    expect(useAssistantStore.getState().status).toBe("error");
    expect(useAssistantStore.getState().error).toContain("no key");
  });
});

describe("assistantStore.applyAction", () => {
  it("executes the action and marks it applied, refreshing tasks", async () => {
    runAssistantTurn.mockResolvedValue({
      reply: "ok",
      actions: [{ id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "pending" }]
    });
    await useAssistantStore.getState().send("add X");
    const msg = useAssistantStore.getState().messages[1];
    await useAssistantStore.getState().applyAction(msg.id, "a1");
    expect(taskState.createTask).toHaveBeenCalledWith({ title: "X" });
    expect(taskState.refresh).toHaveBeenCalled();
    const applied = useAssistantStore.getState().messages[1].actions?.[0];
    expect(applied?.status).toBe("applied");
  });

  it("marks the action failed and toasts when the store method throws", async () => {
    taskState.createTask.mockRejectedValue(new Error("boom"));
    runAssistantTurn.mockResolvedValue({
      reply: "ok",
      actions: [{ id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "pending" }]
    });
    await useAssistantStore.getState().send("add X");
    const msg = useAssistantStore.getState().messages[1];
    await useAssistantStore.getState().applyAction(msg.id, "a1");
    const failed = useAssistantStore.getState().messages[1].actions?.[0];
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("boom");
    expect(uiState.addToast).toHaveBeenCalled();
  });

  it("confirms before a destructive action and marks failed on error", async () => {
    taskState.dropTask = vi.fn().mockResolvedValue({ ok: false, message: "nope" });
    runAssistantTurn.mockResolvedValue({
      reply: "ok",
      actions: [{ id: "d1", type: "drop_task", params: { task_id: "t1", title: "T" }, summary: "Drop T", destructive: true, status: "pending" }]
    });
    await useAssistantStore.getState().send("drop it");
    const msg = useAssistantStore.getState().messages[1];
    await useAssistantStore.getState().applyAction(msg.id, "d1");
    expect(uiState.confirm).toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[1].actions?.[0].status).toBe("failed");
  });
});

describe("assistantStore.updateActionParams", () => {
  it("merges edited params and recomputes the summary", async () => {
    runAssistantTurn.mockResolvedValue({
      reply: "ok",
      actions: [{ id: "a1", type: "create_task", params: { title: "X", due_date: null }, summary: "Create X in backlog", destructive: false, status: "pending" }]
    });
    await useAssistantStore.getState().send("add X");
    const msg = useAssistantStore.getState().messages[1];

    useAssistantStore.getState().updateActionParams(msg.id, "a1", { title: "Launch", due_date: "2026-06-20" });

    const action = useAssistantStore.getState().messages[1].actions?.[0];
    expect(action?.params).toMatchObject({ title: "Launch", due_date: "2026-06-20" });
    expect(action?.summary).toBe('Create task "Launch" for 2026-06-20');
  });

  it("ignores edits to a non-pending action", async () => {
    runAssistantTurn.mockResolvedValue({
      reply: "ok",
      actions: [{ id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "applied" }]
    });
    await useAssistantStore.getState().send("add X");
    const msg = useAssistantStore.getState().messages[1];

    useAssistantStore.getState().updateActionParams(msg.id, "a1", { title: "Changed" });

    expect(useAssistantStore.getState().messages[1].actions?.[0].params).toMatchObject({ title: "X" });
  });
});

describe("assistantStore.insights", () => {
  it("loads insights once and forwards them to the runner", async () => {
    useAssistantStore.setState({ messages: [], status: "idle", error: null, insights: null });
    runAssistantTurn.mockResolvedValue({ reply: "ok", actions: [] });

    await useAssistantStore.getState().send("plan my day");
    await useAssistantStore.getState().send("and tomorrow?");

    expect(buildRetrospectiveInsights).toHaveBeenCalledTimes(1); // cached after first load
    const calls = (runAssistantTurn as unknown as ReturnType<typeof vi.fn>).mock.calls;
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
  it("persists the user and assistant messages on send", async () => {
    runAssistantTurn.mockResolvedValue({ reply: "ok", actions: [] });
    useAssistantStore.setState({ messages: [], status: "idle", error: null });
    await useAssistantStore.getState().send("remember this");
    // one append for the user message, one for the assistant message
    expect(messageRepo.append).toHaveBeenCalledTimes(2);
    expect(messageRepo.append.mock.calls[0][0]).toMatchObject({ role: "user", content: "remember this" });
    expect(messageRepo.append.mock.calls[1][0]).toMatchObject({ role: "assistant", content: "ok" });
  });

  it("hydrate loads recent messages and downgrades stale pending actions", async () => {
    useAssistantStore.setState({ messages: [], status: "idle", error: null });
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
    useAssistantStore.setState({ messages: [], status: "idle", error: null });
    useAssistantStore.getState().clear();
    expect(messageRepo.clear).toHaveBeenCalled();
  });
});
