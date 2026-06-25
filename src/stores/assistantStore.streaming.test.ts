import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { streamChatV2Stub, streamState, emitted } = vi.hoisted(() => ({
  streamChatV2Stub: vi.fn(),
  streamState: { step: 0 },
  emitted: [] as string[]
}));
vi.mock("../services/ai/chatClient", () => ({
  streamChatV2: streamChatV2Stub,
  generateChat: vi.fn()
}));

const { messageRepo } = vi.hoisted(() => ({
  messageRepo: {
    append: vi.fn((_message: unknown): Promise<void> => Promise.resolve()),
    getRecent: vi.fn((_limit: number): Promise<unknown[]> => Promise.resolve([])),
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

vi.mock("../services/ai/assistant/memory/runMemoryReview", () => ({
  runMemoryReview: vi.fn(async (_input: unknown) => {}),
  MEMORY_REVIEW_DEBOUNCE_MS: 0
}));

vi.mock("../services/ai/assistant/recallHistory", () => ({
  loadRecallEntries: vi.fn(async () => [])
}));

vi.mock("../services/retrospect", () => ({
  buildRetrospectiveInsights: vi.fn(async () => ({
    windowDays: 30,
    hasData: false,
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
  updateTask: vi.fn().mockResolvedValue({ ok: true }),
  deleteTask: vi.fn().mockResolvedValue({ ok: true }),
  pauseActiveTask: vi.fn().mockResolvedValue({ ok: true }),
  rescheduleTask: vi.fn(),
  moveTaskToBacklog: vi.fn(),
  dropTask: vi.fn(),
  completeTask: vi.fn(),
  startTask: vi.fn(),
  ensureCategory: vi.fn(),
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
    aiProvider: "openai",
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

const RAW_TOOL_JSON = '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}}]}';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForToolStepEmit(): Promise<void> {
  for (let i = 0; i < 50 && emitted.length === 0; i += 1) {
    await flush();
  }
}

let proceed: () => void = () => {};

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
  taskState.allTasks = [];
  taskState.categories = [];
  taskState.refresh.mockResolvedValue(undefined);
  settingsState.assistantMemoryEnabled = false;
  streamState.step = 0;
  emitted.length = 0;
  proceed = () => {};
  streamChatV2Stub.mockImplementation(
    async (_settings: unknown, _input: unknown, cb: { onToken?: (c: string) => void }) => {
      streamState.step += 1;
      if (streamState.step === 1) {
        emitted.push(RAW_TOOL_JSON);
        cb?.onToken?.(RAW_TOOL_JSON);
        return { text: RAW_TOOL_JSON, toolCalls: [{ name: "list_tasks", args: { scope: "today" } }] };
      }
      await new Promise<void>((resolve) => {
        proceed = resolve;
      });
      emitted.push("Done.");
      cb?.onToken?.("Done.");
      return { text: "Done.", toolCalls: [] };
    }
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const UPDATE_TOOL_JSON =
  '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","priority":"high"}}]}';

function taskFixtureT1(): unknown {
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
    dropped_at: null
  };
}

describe("stop / abort finalization", () => {
  it("stop() mid-final-answer finalizes the message as stopped with partial content", async () => {
    streamChatV2Stub.mockImplementation(
      async (_settings: unknown, _input: unknown, cb: { onToken?: (c: string) => void }) => {
        streamState.step += 1;
        if (streamState.step === 1) {
          emitted.push(RAW_TOOL_JSON);
          cb?.onToken?.(RAW_TOOL_JSON);
          return { text: RAW_TOOL_JSON, toolCalls: [{ name: "list_tasks", args: { scope: "today" } }] };
        }
        cb?.onToken?.("Partial ");
        await new Promise<void>((resolve) => {
          proceed = resolve;
        });
        cb?.onToken?.("tail");
        emitted.push("tail");
        return { text: "Partial tail", toolCalls: [] };
      }
    );

    const sendPromise = useAssistantStore.getState().send("What are my tasks today?");
    await waitForToolStepEmit();
    await flush();

    const mid = useAssistantStore.getState();
    expect(mid.streamingMessageId).not.toBeNull();
    const placeholderId = mid.streamingMessageId!;
    const placeholder = mid.messages.find((m) => m.id === placeholderId);
    expect(placeholder?.content).toBe("Partial ");

    useAssistantStore.getState().stop();
    proceed();
    await sendPromise;

    const final = useAssistantStore.getState();
    expect(final.status).toBe("idle");
    expect(final.streamingMessageId).toBeNull();
    expect(final.steps).toEqual([]);
    const stoppedMsg = final.messages.find((m) => m.role === "assistant");
    expect(stoppedMsg).toBeTruthy();
    expect(stoppedMsg?.stopped).toBe(true);
    expect(stoppedMsg?.content).toBe("Partial ");
    expect(stoppedMsg?.content).not.toContain("tail");
    expect(uiState.addToast).not.toHaveBeenCalled();
    expect(messageRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ id: placeholderId, content: "Partial " })
    );
  });

  it("stop() preserves already-executed tool call records", async () => {
    (taskState as { allTasks: unknown[] }).allTasks = [taskFixtureT1()];
    settingsState.assistantPermissionLevel = "auto";
    streamChatV2Stub.mockImplementation(
      async (_settings: unknown, _input: unknown, cb: { onToken?: (c: string) => void }) => {
        streamState.step += 1;
        if (streamState.step === 1) {
          emitted.push(UPDATE_TOOL_JSON);
          cb?.onToken?.(UPDATE_TOOL_JSON);
          return {
            text: UPDATE_TOOL_JSON,
            toolCalls: [{ name: "update_task", args: { task_id: "t1", priority: "high" } }]
          };
        }
        cb?.onToken?.("Partial ");
        await new Promise<void>((resolve) => {
          proceed = resolve;
        });
        cb?.onToken?.("tail");
        return { text: "Partial tail", toolCalls: [] };
      }
    );

    const sendPromise = useAssistantStore.getState().send("Bump t1 to high priority");
    await waitForToolStepEmit();
    await flush();

    useAssistantStore.getState().stop();
    proceed();
    await sendPromise;

    const final = useAssistantStore.getState();
    expect(final.status).toBe("idle");
    expect(final.streamingMessageId).toBeNull();
    const stoppedMsg = final.messages.find((m) => m.role === "assistant");
    expect(stoppedMsg).toBeTruthy();
    expect(stoppedMsg?.stopped).toBe(true);
    const updateRec = stoppedMsg?.toolCalls?.find((c) => c.name === "update_task");
    expect(updateRec).toBeTruthy();
    expect(updateRec?.status).toBe("executed");
  });
});

describe("assistantStore streaming no-leak contract", () => {
  it("discards a tool-step {tool_calls} placeholder and finalizes only the final answer", async () => {
    const sendPromise = useAssistantStore.getState().send("What are my tasks today?");

    await waitForToolStepEmit();
    await flush();

    expect(emitted).toContain(RAW_TOOL_JSON);
    const mid = useAssistantStore.getState();
    expect(mid.messages.some((m) => m.content.includes("{tool_calls"))).toBe(false);
    expect(mid.status).toBe("thinking");
    expect(mid.streamingMessageId).toBeNull();

    proceed();
    await sendPromise;

    const messages = useAssistantStore.getState().messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    const assistant = messages.find((m) => m.role === "assistant")!;
    expect(assistant.content).not.toContain("{tool_calls");
    expect(assistant.content).toContain("Done.");
    expect(messages.some((m) => m.content.includes("{tool_calls"))).toBe(false);
    expect(useAssistantStore.getState().status).toBe("idle");
    expect(useAssistantStore.getState().streamingMessageId).toBeNull();
  });
});
