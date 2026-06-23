import { create } from "zustand";
import { assistantMessageRepository } from "../db/assistantMessageRepository";
import { ACTION_REGISTRY } from "../services/ai/assistant/actions";
import { autoApplyActions } from "../services/ai/assistant/autoApply";
import { runAssistantTurnStreaming } from "../services/ai/assistant/assistantRunner";
import { loadRecallEntries, type RecallEntry } from "../services/ai/assistant/recallHistory";
import { buildAssistantContext, type AssistantStoreSnapshot } from "../services/ai/assistant/contextBuilder";
import type { ChatMessage, ProposedAction } from "../services/ai/assistant/types";
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

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /abort/i.test(error.message))
  );
}

/** Proposals restored from a previous session are stale — they reference a day
 *  state that may have changed — so they render as already-handled, not actionable. */
export function restoreHistoryActions(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (!message.actions) return message;
    return {
      ...message,
      actions: message.actions.map((action) =>
        action.status === "pending" ? { ...action, status: "dismissed" as const } : action
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
  streamingMessageId: string | null;
  hydrate: () => Promise<void>;
  send: (text: string, modelText?: string) => Promise<void>;
  stop: () => void;
  regenerateLast: () => Promise<void>;
  editUserMessage: (messageId: string, newContent: string) => Promise<void>;
  applyAction: (messageId: string, actionId: string) => Promise<void>;
  applyAll: (messageId: string) => Promise<void>;
  updateActionParams: (messageId: string, actionId: string, patch: Record<string, unknown>) => void;
  dismissAction: (messageId: string, actionId: string) => void;
  clear: () => void;
  loadInsights: () => Promise<void>;
  loadHistory: () => Promise<void>;
  refreshInsights: () => Promise<void>;
};

/** Ids of actions in a message that are safe to bulk-apply (pending, non-destructive). */
export function nextAfterApplyAll(messages: ChatMessage[], messageId: string): string[] {
  const message = messages.find((m) => m.id === messageId);
  if (!message?.actions) return [];
  return message.actions.filter((a) => a.status === "pending" && !a.destructive).map((a) => a.id);
}

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
    assistantSoul: useSettingsStore.getState().settings.assistantSoul
  };
}

function toChatTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages.map((message) => ({ role: message.role, content: message.modelContent ?? message.content }));
}

/** Immutably replace one action inside one message. */
function patchAction(
  messages: ChatMessage[],
  messageId: string,
  actionId: string,
  patch: Partial<ProposedAction>
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== messageId || !message.actions) return message;
    return {
      ...message,
      actions: message.actions.map((action) =>
        action.id === actionId ? { ...action, ...patch } : action
      )
    };
  });
}

/** Immutably set content/actions/stopped on one message by id. */
function patchMessage(
  messages: ChatMessage[],
  messageId: string,
  patch: Partial<ChatMessage>
): ChatMessage[] {
  return messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m));
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  messages: [],
  status: "idle",
  error: null,
  steps: [],
  insights: null,
  history: null,
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

  applyAction: async (messageId, actionId) => {
    const message = get().messages.find((entry) => entry.id === messageId);
    const action = message?.actions?.find((entry) => entry.id === actionId);
    if (!action || action.status !== "pending") return;

    if (action.destructive) {
      const confirmed = await useUiStore.getState().confirm({
        message: `${action.summary}?`,
        confirmLabel: "Apply",
        danger: true
      });
      if (!confirmed) return;
    }

    const descriptor = ACTION_REGISTRY[action.type];
    try {
      const result = await descriptor.execute(action.params, useTaskStore.getState());
      if (result.ok) {
        await useTaskStore.getState().refresh();
        set({ messages: patchAction(get().messages, messageId, actionId, { status: "applied" }) });
      } else {
        set({ messages: patchAction(get().messages, messageId, actionId, { status: "failed", error: result.message }) });
        useUiStore.getState().addToast({ kind: "error", title: "Could not apply", description: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not apply this change";
      set({ messages: patchAction(get().messages, messageId, actionId, { status: "failed", error: message }) });
      useUiStore.getState().addToast({ kind: "error", title: "Could not apply", description: message });
    }
  },

  applyAll: async (messageId) => {
    const ids = nextAfterApplyAll(get().messages, messageId);
    for (const actionId of ids) {
      await get().applyAction(messageId, actionId);
    }
  },

  updateActionParams: (messageId, actionId, patch) => {
    const message = get().messages.find((entry) => entry.id === messageId);
    const action = message?.actions?.find((entry) => entry.id === actionId);
    if (!action || action.status !== "pending") return;

    const nextParams = { ...(action.params as Record<string, unknown>), ...patch };
    const descriptor = ACTION_REGISTRY[action.type];
    const ctx = buildAssistantContext(snapshot(), get().insights);
    let summary = action.summary;
    try {
      summary = descriptor.describe(nextParams, ctx);
    } catch {
      // Keep the previous summary if the edited params can't be described yet.
    }
    set({ messages: patchAction(get().messages, messageId, actionId, { params: nextParams, summary }) });
  },

  dismissAction: (messageId, actionId) => {
    set({ messages: patchAction(get().messages, messageId, actionId, { status: "dismissed" }) });
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
 * Run the streaming assistant turn from an existing message history (without
 * appending or persisting a new user message). Shared by `send`,
 * `regenerateLast`, and `editUserMessage`.
 */
async function runStreamFrom(history: ChatMessage[]): Promise<void> {
  const store = useAssistantStore;
  await store.getState().loadInsights();
  await store.getState().loadHistory();

  currentAbort = new AbortController();
  const signal = currentAbort.signal;
  store.setState({ status: "thinking", error: null, steps: [], streamingMessageId: null });

  let streamingId: string | null = null;
  let lastActions: ProposedAction[] = [];
  let tokenBuffer = "";
  let flushScheduled = false;

  const flushTokens = () => {
    flushScheduled = false;
    if (streamingId === null) return;
    const chunk = tokenBuffer;
    tokenBuffer = "";
    if (chunk.length === 0) return;
    store.setState((state) => ({
      messages: patchMessage(state.messages, streamingId as string, {
        content: (state.messages.find((m) => m.id === streamingId)?.content ?? "") + chunk
      })
    }));
  };

  const onStep = (label: string) => store.setState((state) => ({ steps: [...state.steps, label] }));

  const onToken = (chunk: string) => {
    if (streamingId === null) {
      // First token: create the placeholder assistant message and flip to streaming.
      const id = createId("msg");
      streamingId = id;
      store.setState((state) => ({
        messages: [...state.messages, { id, role: "assistant", content: chunk, createdAt: new Date().toISOString() }],
        streamingMessageId: id,
        status: "streaming"
      }));
      return;
    }
    tokenBuffer += chunk;
    if (typeof requestAnimationFrame === "function") {
      if (!flushScheduled) {
        flushScheduled = true;
        requestAnimationFrame(flushTokens);
      }
    } else {
      flushTokens();
    }
  };

  const onActions = async (actions: ProposedAction[]) => {
    const executed = await autoApplyActions(actions, useTaskStore.getState());
    if (executed.appliedCount > 0) await useTaskStore.getState().refresh();
    lastActions = executed.actions;
    if (streamingId !== null) {
      store.setState((state) => ({ messages: patchMessage(state.messages, streamingId as string, { actions: executed.actions }) }));
    }
  };

  const onDone = async (fullReply: string) => {
    const aborted = signal.aborted;
    if (streamingId === null) {
      // No tokens streamed (forced fallback or empty stream). On an abort with
      // nothing to show, just go idle without leaving an empty message.
      if (aborted && fullReply.length === 0) {
        store.setState({ status: "idle", streamingMessageId: null, steps: [] });
        currentAbort = null;
        return;
      }
      const id = createId("msg");
      const msg: ChatMessage = {
        id,
        role: "assistant",
        content: fullReply,
        createdAt: new Date().toISOString(),
        actions: lastActions,
        ...(aborted ? { stopped: true } : {})
      };
      store.setState((state) => ({ messages: [...state.messages, msg], status: "idle", streamingMessageId: null, steps: [] }));
      void assistantMessageRepository.append(msg).catch(() => {});
    } else {
      // Flush any buffered tokens before committing the final content.
      flushTokens();
      store.setState((state) => ({
        messages: patchMessage(state.messages, streamingId as string, {
          content: fullReply,
          actions: lastActions,
          ...(aborted ? { stopped: true } : {})
        }),
        status: "idle",
        streamingMessageId: null,
        steps: []
      }));
      const finalized = store.getState().messages.find((m) => m.id === streamingId);
      if (finalized) void assistantMessageRepository.append(finalized).catch(() => {});
    }
    currentAbort = null;
  };

  try {
    await runAssistantTurnStreaming(
      {
        settings: useSettingsStore.getState().settings,
        snapshot: snapshot(),
        messages: toChatTurns(history),
        insights: store.getState().insights,
        history: store.getState().history ?? []
      },
      { onStep, onToken, onActions, onDone, signal }
    );
  } catch (error) {
    if (isAbortError(error)) {
      // Defensive: the transport normally resolves on abort; ensure we're idle.
      store.setState({ status: "idle", streamingMessageId: null, steps: [] });
      currentAbort = null;
    } else {
      const message = error instanceof Error ? error.message : "The assistant ran into a problem";
      store.setState({ status: "error", error: message, steps: [], streamingMessageId: null });
      useUiStore.getState().addToast({ kind: "error", title: "Assistant error", description: message });
      currentAbort = null;
    }
  }
}
