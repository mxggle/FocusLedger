import { create } from "zustand";
import { ACTION_REGISTRY } from "../services/ai/assistant/actions";
import { runAssistantTurn } from "../services/ai/assistant/assistantRunner";
import type { AssistantStoreSnapshot } from "../services/ai/assistant/contextBuilder";
import type { ChatMessage, ProposedAction } from "../services/ai/assistant/types";
import type { ChatTurn } from "../services/ai/providers";
import { buildRetrospectiveInsights } from "../services/retrospect";
import type { RetrospectiveInsights } from "../services/retrospect/types";
import { createId } from "../utils/id";
import { useSettingsStore } from "./settingsStore";
import { useTaskStore } from "./taskStore";
import { useUiStore } from "./uiStore";

export type AssistantStatus = "idle" | "thinking" | "error";

type AssistantState = {
  messages: ChatMessage[];
  status: AssistantStatus;
  error: string | null;
  insights: RetrospectiveInsights | null;
  send: (text: string) => Promise<void>;
  applyAction: (messageId: string, actionId: string) => Promise<void>;
  dismissAction: (messageId: string, actionId: string) => void;
  clear: () => void;
  loadInsights: () => Promise<void>;
  refreshInsights: () => Promise<void>;
};

function snapshot(): AssistantStoreSnapshot {
  const state = useTaskStore.getState();
  return {
    selectedDate: state.selectedDate,
    tasks: state.tasks,
    backlogTasks: state.backlogTasks,
    categories: state.categories
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
  insights: null,

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
    set({ messages: history, status: "thinking", error: null });
    await get().loadInsights();

    try {
      const result = await runAssistantTurn({
        settings: useSettingsStore.getState().settings,
        snapshot: snapshot(),
        messages: toChatTurns(history),
        insights: get().insights
      });
      const assistantMessage: ChatMessage = {
        id: createId("msg"),
        role: "assistant",
        content: result.reply,
        createdAt: new Date().toISOString(),
        actions: result.actions
      };
      set({ messages: [...history, assistantMessage], status: "idle" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The assistant ran into a problem";
      set({ status: "error", error: message });
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

  clear: () => set({ messages: [], status: "idle", error: null })
}));
