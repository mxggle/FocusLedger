import { create } from "zustand";
import { assistantMessageRepository } from "../db/assistantMessageRepository";
import { ACTION_REGISTRY } from "../services/ai/assistant/actions";
import { runAssistantTurn } from "../services/ai/assistant/assistantRunner";
import { buildAssistantContext, type AssistantStoreSnapshot } from "../services/ai/assistant/contextBuilder";
import type { ChatMessage, ProposedAction } from "../services/ai/assistant/types";
import type { ChatTurn } from "../services/ai/providers";
import { buildRetrospectiveInsights } from "../services/retrospect";
import type { RetrospectiveInsights } from "../services/retrospect/types";
import { createId } from "../utils/id";
import { useSettingsStore } from "./settingsStore";
import { useTaskStore } from "./taskStore";
import { useUiStore } from "./uiStore";

export type AssistantStatus = "idle" | "thinking" | "error";

/** How many past messages to restore on launch. Bounds the prompt size too. */
const HISTORY_LIMIT = 40;

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
  hydrate: () => Promise<void>;
  send: (text: string) => Promise<void>;
  applyAction: (messageId: string, actionId: string) => Promise<void>;
  applyAll: (messageId: string) => Promise<void>;
  updateActionParams: (messageId: string, actionId: string, patch: Record<string, unknown>) => void;
  dismissAction: (messageId: string, actionId: string) => void;
  clear: () => void;
  loadInsights: () => Promise<void>;
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
    profile: useSettingsStore.getState().settings.assistantProfile
  };
}

function toChatTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages.map((message) => ({ role: message.role, content: message.content }));
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

export const useAssistantStore = create<AssistantState>((set, get) => ({
  messages: [],
  status: "idle",
  error: null,
  steps: [],
  insights: null,

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

  send: async (text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || get().status === "thinking") return;

    const userMessage: ChatMessage = {
      id: createId("msg"),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString()
    };
    const history = [...get().messages, userMessage];
    set({ messages: history, status: "thinking", error: null, steps: [] });
    void assistantMessageRepository.append(userMessage).catch(() => {});
    await get().loadInsights();

    try {
      const result = await runAssistantTurn({
        settings: useSettingsStore.getState().settings,
        snapshot: snapshot(),
        messages: toChatTurns(history),
        insights: get().insights,
        onStep: (label) => set({ steps: [...get().steps, label] })
      });
      const assistantMessage: ChatMessage = {
        id: createId("msg"),
        role: "assistant",
        content: result.reply,
        createdAt: new Date().toISOString(),
        actions: result.actions
      };
      set({ messages: [...history, assistantMessage], status: "idle", steps: [] });
      void assistantMessageRepository.append(assistantMessage).catch(() => {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "The assistant ran into a problem";
      set({ status: "error", error: message, steps: [] });
      useUiStore.getState().addToast({ kind: "error", title: "Assistant error", description: message });
    }
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

  refreshInsights: async () => {
    try {
      set({ insights: await buildRetrospectiveInsights() });
    } catch {
      set({ insights: null });
    }
  },

  clear: () => {
    set({ messages: [], status: "idle", error: null, steps: [] });
    void assistantMessageRepository.clear().catch(() => {});
  }
}));
