import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../services/ai/assistant/types";

const { runAssistantToolTurn } = vi.hoisted(() => ({ runAssistantToolTurn: vi.fn() }));
vi.mock("../services/ai/assistant/assistantRunner", () => ({ runAssistantToolTurn }));

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
  memoryRepo: { getActive: vi.fn((): Promise<unknown[]> => Promise.resolve([])) }
}));
vi.mock("../db/assistantMemoryRepository", () => ({ assistantMemoryRepository: memoryRepo }));

const { reviewMock } = vi.hoisted(() => ({ reviewMock: { runMemoryReview: vi.fn(async () => {}) } }));
vi.mock("../services/ai/assistant/memory/runMemoryReview", () => ({
  runMemoryReview: reviewMock.runMemoryReview,
  MEMORY_REVIEW_DEBOUNCE_MS: 0
}));

vi.mock("../services/ai/assistant/recallHistory", () => ({ loadRecallEntries: vi.fn(async () => []) }));

vi.mock("../services/retrospect", () => ({
  buildRetrospectiveInsights: vi.fn(async () => ({
    windowDays: 30,
    hasData: false,
    calibration: { overall: null, byCategory: [] },
    slips: { items: [], moreCount: 0, blockerThemes: [] },
    weekly: { thisWeekMinutes: 0, lastWeekMinutes: 0, deltaMinutes: 0, categoryDeltas: [], completedCount: 0, droppedCount: 0 }
  }))
}));

const taskState = {
  selectedDate: "2026-06-23",
  tasks: [] as unknown[],
  backlogTasks: [] as unknown[],
  categories: [],
  allTasks: [] as unknown[],
  refresh: vi.fn(async () => {})
};
vi.mock("./taskStore", () => ({ useTaskStore: { getState: () => taskState } }));

const uiState = { addToast: vi.fn(), confirm: vi.fn().mockResolvedValue(true), requestRoute: vi.fn(), closeAssistant: vi.fn() };
vi.mock("./uiStore", () => ({ useUiStore: { getState: () => uiState } }));

const { settingsRepo } = vi.hoisted(() => ({ settingsRepo: { set: vi.fn(async (_key: string, _value: unknown) => {}), getAll: vi.fn(async () => ({})) } }));
vi.mock("../db/settingsRepository", () => ({ settingsRepository: settingsRepo }));

import { useSettingsStore } from "./settingsStore";
import { useAssistantStore } from "./assistantStore";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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
  useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, aiProvider: "anthropic", aiApiKey: "", aiModel: "", aiBaseUrl: "", assistantProfile: "", assistantSoul: "", assistantName: "Yolo Assistant", assistantPermissionLevel: "auto", assistantMemoryEnabled: false, assistantMemoryModel: "" }, loading: false });
  vi.clearAllMocks();
  runAssistantToolTurn.mockReset();
  runAssistantToolTurn.mockResolvedValue({ reply: "ok", toolCalls: [] });
});

describe("AI-UI-13: AI settings persist and affect the next turn", () => {
  it("updateSetting persists each AI field via settingsRepository.set", async () => {
    await useSettingsStore.getState().updateSetting("aiProvider", "openai");
    await useSettingsStore.getState().updateSetting("aiModel", "gpt-4o-mini");
    await useSettingsStore.getState().updateSetting("aiApiKey", "newkey");
    await useSettingsStore.getState().updateSetting("assistantPermissionLevel", "ask");
    await useSettingsStore.getState().updateSetting("assistantProfile", "PM relocating to Tokyo");
    await useSettingsStore.getState().updateSetting("assistantSoul", "Be concise and kind.");
    await useSettingsStore.getState().updateSetting("assistantName", "Coach");
    await useSettingsStore.getState().updateSetting("assistantMemoryEnabled", true);

    const setCalls = settingsRepo.set.mock.calls.map((call) => [call[0], call[1]]);
    expect(setCalls).toContainEqual(["aiProvider", "openai"]);
    expect(setCalls).toContainEqual(["aiModel", "gpt-4o-mini"]);
    expect(setCalls).toContainEqual(["aiApiKey", "newkey"]);
    expect(setCalls).toContainEqual(["assistantPermissionLevel", "ask"]);
    expect(setCalls).toContainEqual(["assistantProfile", "PM relocating to Tokyo"]);
    expect(setCalls).toContainEqual(["assistantSoul", "Be concise and kind."]);
    expect(setCalls).toContainEqual(["assistantName", "Coach"]);
    expect(setCalls).toContainEqual(["assistantMemoryEnabled", true]);

    const settings = useSettingsStore.getState().settings;
    expect(settings.aiProvider).toBe("openai");
    expect(settings.aiModel).toBe("gpt-4o-mini");
    expect(settings.aiApiKey).toBe("newkey");
    expect(settings.assistantPermissionLevel).toBe("ask");
    expect(settings.assistantProfile).toBe("PM relocating to Tokyo");
    expect(settings.assistantSoul).toBe("Be concise and kind.");
    expect(settings.assistantName).toBe("Coach");
    expect(settings.assistantMemoryEnabled).toBe(true);
  });

  it("send() forwards the persisted provider/model/key and autonomy/profile/soul/name into the next turn", async () => {
    await useSettingsStore.getState().updateSetting("aiProvider", "openai");
    await useSettingsStore.getState().updateSetting("aiModel", "gpt-4o-mini");
    await useSettingsStore.getState().updateSetting("aiApiKey", "newkey");
    await useSettingsStore.getState().updateSetting("assistantPermissionLevel", "ask");
    await useSettingsStore.getState().updateSetting("assistantProfile", "PM relocating to Tokyo");
    await useSettingsStore.getState().updateSetting("assistantSoul", "Be concise and kind.");
    await useSettingsStore.getState().updateSetting("assistantName", "Coach");

    await useAssistantStore.getState().send("plan my day");

    const lastCall = runAssistantToolTurn.mock.calls.at(-1);
    expect(lastCall).toBeTruthy();
    const input = lastCall![0] as {
      settings: { aiProvider: string; aiModel: string; aiApiKey: string };
      snapshot: { permissionLevel: string; profile?: string; assistantSoul?: string; assistantName?: string };
    };
    expect(input.settings.aiProvider).toBe("openai");
    expect(input.settings.aiModel).toBe("gpt-4o-mini");
    expect(input.settings.aiApiKey).toBe("newkey");
    expect(input.snapshot.permissionLevel).toBe("ask");
    expect(input.snapshot.profile).toBe("PM relocating to Tokyo");
    expect(input.snapshot.assistantSoul).toBe("Be concise and kind.");
    expect(input.snapshot.assistantName).toBe("Coach");
  });

  it("memory disabled: the background memory review is not scheduled after a turn", async () => {
    await useSettingsStore.getState().updateSetting("assistantMemoryEnabled", false);
    await useAssistantStore.getState().send("plan my day");
    await flush();
    await flush();
    expect(reviewMock.runMemoryReview).not.toHaveBeenCalled();
  });

  it("memory enabled with a non-empty reply: the background memory review runs", async () => {
    await useSettingsStore.getState().updateSetting("assistantMemoryEnabled", true);
    runAssistantToolTurn.mockResolvedValueOnce({ reply: "Here is your plan.", toolCalls: [] });
    await useAssistantStore.getState().send("plan my day");
    await flush();
    await flush();
    await flush();
    expect(reviewMock.runMemoryReview).toHaveBeenCalledTimes(1);
  });
});
