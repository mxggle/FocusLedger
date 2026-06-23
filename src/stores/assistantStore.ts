import { create } from "zustand";
import { assistantMessageRepository } from "../db/assistantMessageRepository";
import { assistantMemoryRepository } from "../db/assistantMemoryRepository";
import { rankMemories, MEMORY_INJECT_K } from "../services/ai/assistant/memory/retrieve";
import { runMemoryReview, MEMORY_REVIEW_DEBOUNCE_MS } from "../services/ai/assistant/memory/runMemoryReview";
import type { MemoryEntry } from "../services/ai/assistant/memory/types";
import { createAgentTaskStore } from "../services/ai/assistant/agentTools/storeAdapter";
import { hasDrifted, revertToolCall as revertExecutedToolCall } from "../services/ai/assistant/agentTools/revert";
import { toolByName } from "../services/ai/assistant/agentTools/registry";
import type { ToolCallRecord } from "../services/ai/assistant/agentTools/types";
import { runAssistantToolTurn } from "../services/ai/assistant/assistantRunner";
import { loadRecallEntries, type RecallEntry } from "../services/ai/assistant/recallHistory";
import { buildAssistantContext, type AssistantStoreSnapshot } from "../services/ai/assistant/contextBuilder";
import type { ChatMessage } from "../services/ai/assistant/types";
import type { ChatTurn } from "../services/ai/providers";
import { buildRetrospectiveInsights } from "../services/retrospect";
import type { RetrospectiveInsights } from "../services/retrospect/types";
import { createId } from "../utils/id";
import { useSettingsStore } from "./settingsStore";
import { useTaskStore } from "./taskStore";
import { useUiStore } from "./uiStore";

export type AssistantStatus = "idle" | "thinking" | "streaming" | "error";

/** How many past messages to restore on launch. Bounds the prompt size too. */
const HISTORY_LIMIT = 40;

/** Abort controller for the in-flight stream. Kept outside Zustand state. */
let currentAbort: AbortController | null = null;

/** Debounce timer for the post-turn background memory review. */
let memoryReviewTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced background memory review for the just-finished exchange. */
function scheduleMemoryReview(userText: string, assistantText: string): void {
  const settings = useSettingsStore.getState().settings;
  if (!settings.assistantMemoryEnabled) return;
  if (userText.trim().length === 0 || assistantText.trim().length === 0) return;
  if (memoryReviewTimer) clearTimeout(memoryReviewTimer);
  memoryReviewTimer = setTimeout(() => {
    memoryReviewTimer = null;
    const aux = settings.assistantMemoryModel.trim() || settings.aiModel;
    void runMemoryReview({
      settings: { ...settings, aiModel: aux },
      userText,
      assistantText,
      existing: useAssistantStore.getState().memories ?? []
    })
      .then(() => useAssistantStore.getState().loadMemories(true)) // refresh cache with new learning
      .catch(() => {});
  }, MEMORY_REVIEW_DEBOUNCE_MS);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /abort/i.test(error.message))
  );
}

/** Pending tool calls restored from a previous session are stale — they reference
 *  a day state that may have changed — so they render as already-handled. */
export function restoreHistoryActions(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (!message.toolCalls) return message;
    return {
      ...message,
      toolCalls: message.toolCalls.map((call) =>
        call.status === "pending" ? { ...call, status: "dismissed" as const } : call
      )
    };
  });
}

type AssistantState = {
  messages: ChatMessage[];
  status: AssistantStatus;
  error: string | null;
  steps: string[];
  insights: RetrospectiveInsights | null;
  history: RecallEntry[] | null;
  memories: MemoryEntry[] | null;
  streamingMessageId: string | null;
  hydrate: () => Promise<void>;
  send: (text: string, modelText?: string) => Promise<void>;
  stop: () => void;
  regenerateLast: () => Promise<void>;
  editUserMessage: (messageId: string, newContent: string) => Promise<void>;
  applyToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  revertToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  dismissToolCall: (messageId: string, toolCallId: string) => void;
  clear: () => void;
  loadInsights: () => Promise<void>;
  loadHistory: () => Promise<void>;
  loadMemories: (force?: boolean) => Promise<void>;
  refreshInsights: () => Promise<void>;
};

function snapshot(): AssistantStoreSnapshot {
  const state = useTaskStore.getState();
  return {
    selectedDate: state.selectedDate,
    tasks: state.tasks,
    backlogTasks: state.backlogTasks,
    categories: state.categories,
    allTasks: state.allTasks,
    profile: useSettingsStore.getState().settings.assistantProfile,
    targetMinutes: useSettingsStore.getState().settings.dailyFocusTargetMinutes,
    assistantName: useSettingsStore.getState().settings.assistantName,
    assistantSoul: useSettingsStore.getState().settings.assistantSoul,
    permissionLevel: useSettingsStore.getState().settings.assistantPermissionLevel
  };
}

function toChatTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages.map((message) => ({ role: message.role, content: message.modelContent ?? message.content }));
}

function patchToolCall(
  messages: ChatMessage[],
  messageId: string,
  toolCallId: string,
  patch: Partial<ToolCallRecord>
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== messageId || !message.toolCalls) return message;
    return {
      ...message,
      toolCalls: message.toolCalls.map((call) =>
        call.id === toolCallId ? { ...call, ...patch } : call
      )
    };
  });
}

function expectedUpdatedAtFor(call: Pick<ToolCallRecord, "undo">): string | undefined {
  if (!call.undo || call.undo.kind !== "restore_task") return undefined;
  return useTaskStore.getState().allTasks.find((task) => task.id === call.undo?.taskId)?.updated_at;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  messages: [],
  status: "idle",
  error: null,
  steps: [],
  insights: null,
  history: null,
  memories: null,
  streamingMessageId: null,

  hydrate: async () => {
    if (get().messages.length > 0) return; // already loaded this session
    try {
      const restored = restoreHistoryActions(await assistantMessageRepository.getRecent(HISTORY_LIMIT));
      // Don't clobber a conversation the user started while we were loading.
      if (get().messages.length === 0 && restored.length > 0) {
        set({ messages: restored });
      }
    } catch {
      // Best-effort: a fresh conversation is fine if history can't be loaded.
    }
  },

  send: async (text, modelText) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const status = get().status;
    if (status === "thinking" || status === "streaming") return;

    const trimmedModel = modelText?.trim();
    const userMessage: ChatMessage = {
      id: createId("msg"),
      role: "user",
      content: trimmed,
      modelContent: trimmedModel && trimmedModel !== trimmed ? trimmedModel : undefined,
      createdAt: new Date().toISOString()
    };
    const history = [...get().messages, userMessage];
    set({ messages: history, status: "thinking", error: null, steps: [], streamingMessageId: null });
    void assistantMessageRepository.append(userMessage).catch(() => {});
    await runStreamFrom(history);
  },

  stop: () => {
    const status = get().status;
    if (status !== "thinking" && status !== "streaming") return;
    currentAbort?.abort();
  },

  regenerateLast: async () => {
    if (get().status !== "idle") return;
    const messages = get().messages;
    let lastAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }
    if (lastAssistantIdx === -1) return;
    const removed = messages[lastAssistantIdx];
    const remaining = messages.slice(0, lastAssistantIdx);
    set({ messages: remaining, status: "thinking", error: null, steps: [], streamingMessageId: null });
    void assistantMessageRepository.deleteOne(removed.id).catch(() => {});
    await runStreamFrom(remaining);
  },

  editUserMessage: async (messageId, newContent) => {
    if (get().status !== "idle") return;
    const trimmed = newContent.trim();
    if (trimmed.length === 0) return;
    const messages = get().messages;
    const idx = messages.findIndex((m) => m.id === messageId && m.role === "user");
    if (idx === -1) return;
    const edited: ChatMessage = { ...messages[idx], content: trimmed };
    const kept = [...messages.slice(0, idx), edited];
    set({ messages: kept, status: "thinking", error: null, steps: [], streamingMessageId: null });
    void assistantMessageRepository.deleteAfter(messageId).catch(() => {});
    void assistantMessageRepository.append(edited).catch(() => {});
    await runStreamFrom(kept);
  },

  applyToolCall: async (messageId, toolCallId) => {
    const message = get().messages.find((entry) => entry.id === messageId);
    const call = message?.toolCalls?.find((entry) => entry.id === toolCallId);
    if (!call || call.status !== "pending") return;

    const tool = toolByName(call.name);
    if (!tool || tool.category !== "write") {
      set({
        messages: patchToolCall(get().messages, messageId, toolCallId, {
          status: "failed",
          error: "Tool is unavailable"
        })
      });
      return;
    }

    if (tool.destructive) {
      const confirmed = await useUiStore.getState().confirm({
        message: `${call.summary}?`,
        confirmLabel: "Apply",
        danger: true
      });
      if (!confirmed) return;
    }

    const parsed = tool.parameters.safeParse(call.args);
    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? "Invalid tool arguments";
      set({ messages: patchToolCall(get().messages, messageId, toolCallId, { status: "failed", error }) });
      return;
    }

    const adapter = createAgentTaskStore();
    const ctx = buildAssistantContext(snapshot(), get().insights);
    try {
      const result = await tool.execute(parsed.data, {
        store: adapter,
        ctx,
        insights: get().insights,
        history: get().history ?? [],
        now: () => new Date().toISOString()
      });
      if (!result.ok) {
        set({
          messages: patchToolCall(get().messages, messageId, toolCallId, {
            status: "failed",
            error: result.error,
            result: result.error
          })
        });
        useUiStore.getState().addToast({ kind: "error", title: "Could not apply", description: result.error });
        return;
      }

      await adapter.refresh();
      set({
        messages: patchToolCall(get().messages, messageId, toolCallId, {
          status: "executed",
          summary: result.summary,
          result: result.summary,
          undo: result.undo,
          expectedUpdatedAt: expectedUpdatedAtFor({ undo: result.undo })
        })
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not apply this change";
      set({
        messages: patchToolCall(get().messages, messageId, toolCallId, {
          status: "failed",
          error: detail,
          result: detail
        })
      });
      useUiStore.getState().addToast({ kind: "error", title: "Could not apply", description: detail });
    }
  },

  revertToolCall: async (messageId, toolCallId) => {
    const message = get().messages.find((entry) => entry.id === messageId);
    const call = message?.toolCalls?.find((entry) => entry.id === toolCallId);
    if (!call || call.status !== "executed" || !call.undo) return;

    const adapter = createAgentTaskStore();
    const currentTask = useTaskStore.getState().allTasks.find((task) => task.id === call.undo?.taskId);
    if (hasDrifted(call, currentTask)) {
      const confirmed = await useUiStore.getState().confirm({
        message: "This task changed after the assistant edited it. Revert anyway?",
        confirmLabel: "Revert"
      });
      if (!confirmed) return;
    }

    const result = await revertExecutedToolCall(call, adapter);
    if (result.ok) {
      await adapter.refresh();
      set({ messages: patchToolCall(get().messages, messageId, toolCallId, { status: "reverted" }) });
      return;
    }

    const detail = result.message ?? "Could not revert this change";
    set({ messages: patchToolCall(get().messages, messageId, toolCallId, { status: "failed", error: detail }) });
    useUiStore.getState().addToast({ kind: "error", title: "Could not revert", description: detail });
  },

  dismissToolCall: (messageId, toolCallId) => {
    set({ messages: patchToolCall(get().messages, messageId, toolCallId, { status: "dismissed" }) });
  },

  loadInsights: async () => {
    if (get().insights) return; // cached for the session
    try {
      const insights = await buildRetrospectiveInsights();
      set({ insights });
    } catch {
      // Analytics are best-effort; the assistant still works without them.
      set({ insights: null });
    }
  },

  loadHistory: async () => {
    if (get().history) return; // cached for the session
    try {
      set({ history: await loadRecallEntries() });
    } catch {
      // Recall is best-effort; the assistant still works without history.
      set({ history: [] });
    }
  },

  loadMemories: async (force = false) => {
    if (!force && get().memories) return; // cached for the session
    try {
      set({ memories: await assistantMemoryRepository.getActive() });
    } catch {
      set({ memories: [] }); // best-effort
    }
  },

  refreshInsights: async () => {
    try {
      set({ insights: await buildRetrospectiveInsights() });
    } catch {
      set({ insights: null });
    }
  },

  clear: () => {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    set({ messages: [], status: "idle", error: null, steps: [], streamingMessageId: null });
    void assistantMessageRepository.clear().catch(() => {});
  }
}));

/**
 * Run a tool-calling assistant turn from an existing message history (without
 * appending or persisting a new user message). Shared by `send`,
 * `regenerateLast`, and `editUserMessage`.
 */
async function runStreamFrom(history: ChatMessage[]): Promise<void> {
  const store = useAssistantStore;
  await store.getState().loadInsights();
  await store.getState().loadHistory();
  await store.getState().loadMemories();

  const lastUserText = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const rankedMemories = rankMemories(store.getState().memories ?? [], lastUserText, MEMORY_INJECT_K);
  const turnSnapshot = { ...snapshot(), learnedMemories: rankedMemories };

  currentAbort = new AbortController();
  const controller = currentAbort;
  const signal = controller.signal;
  store.setState({ status: "thinking", error: null, steps: [], streamingMessageId: null });

  const onStep = (label: string) => store.setState((state) => ({ steps: [...state.steps, label] }));

  try {
    const adapter = createAgentTaskStore();
    const result = await runAssistantToolTurn(
      {
        settings: useSettingsStore.getState().settings,
        snapshot: turnSnapshot,
        messages: toChatTurns(history),
        insights: store.getState().insights,
        history: store.getState().history ?? [],
        onStep
      },
      { store: adapter }
    );

    if (signal.aborted || currentAbort !== controller) {
      store.setState({ status: "idle", streamingMessageId: null, steps: [] });
      if (currentAbort === controller) currentAbort = null;
      return;
    }

    if (result.toolCalls.some((call) => call.status === "executed")) {
      await adapter.refresh();
    }

    const msg: ChatMessage = {
      id: createId("msg"),
      role: "assistant",
      content: result.reply,
      createdAt: new Date().toISOString(),
      toolCalls: result.toolCalls
    };
    store.setState((state) => ({
      messages: [...state.messages, msg],
      status: "idle",
      streamingMessageId: null,
      steps: []
    }));
    void assistantMessageRepository.append(msg).catch(() => {});
    if (result.reply.trim().length > 0) {
      scheduleMemoryReview(lastUserText, result.reply);
    }
    currentAbort = null;
  } catch (error) {
    if (isAbortError(error) || signal.aborted || currentAbort !== controller) {
      store.setState({ status: "idle", streamingMessageId: null, steps: [] });
      if (currentAbort === controller) currentAbort = null;
    } else {
      const message = error instanceof Error ? error.message : "The assistant ran into a problem";
      store.setState({ status: "error", error: message, steps: [], streamingMessageId: null });
      useUiStore.getState().addToast({ kind: "error", title: "Assistant error", description: message });
      currentAbort = null;
    }
  }
}
