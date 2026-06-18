import { beforeEach, describe, expect, it, vi } from "vitest";

const { runAssistantTurn } = vi.hoisted(() => ({ runAssistantTurn: vi.fn() }));
vi.mock("../services/ai/assistant/assistantRunner", () => ({ runAssistantTurn }));

const taskState = {
  selectedDate: "2026-06-18",
  tasks: [],
  backlogTasks: [],
  categories: [],
  createTask: vi.fn().mockResolvedValue({ ok: true }),
  rescheduleTask: vi.fn(), moveTaskToBacklog: vi.fn(), dropTask: vi.fn(),
  completeTask: vi.fn(), startTask: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined)
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
