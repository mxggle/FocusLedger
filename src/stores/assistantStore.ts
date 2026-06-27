import { create } from "zustand";
import { assistantMessageRepository } from "../db/assistantMessageRepository";
import { assistantSessionRepository } from "../db/assistantSessionRepository";
import type { AssistantSession } from "../db/types";
import { deriveSessionTitle } from "../services/ai/assistant/sessionTitle";
import { assistantMemoryRepository } from "../db/assistantMemoryRepository";
import { rankMemories, MEMORY_INJECT_K } from "../services/ai/assistant/memory/retrieve";
import { runMemoryReview, MEMORY_REVIEW_DEBOUNCE_MS } from "../services/ai/assistant/memory/runMemoryReview";
import type { MemoryEntry } from "../services/ai/assistant/memory/types";
import { assistantSkillRepository } from "../db/assistantSkillRepository";
import { rankSkills, SKILL_INJECT_K } from "../services/ai/assistant/skills/rank";
import { runSkillReview, SKILL_REVIEW_DEBOUNCE_MS } from "../services/ai/assistant/skills/runSkillReview";
import type { AssistantSkill } from "../services/ai/assistant/skills/types";
import { createAgentTaskStore } from "../services/ai/assistant/agentTools/storeAdapter";
import { hasDrifted, revertToolCall as revertExecutedToolCall } from "../services/ai/assistant/agentTools/revert";
import { isDestructive } from "../services/ai/assistant/agentTools/permissions";
import { toolByName } from "../services/ai/assistant/agentTools/registry";
import type { ConversationRecallEntry, ToolCallRecord } from "../services/ai/assistant/agentTools/types";
import { runAssistantToolTurn } from "../services/ai/assistant/assistantRunner";
import { streamChatV2 } from "../services/ai/chatClient";
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

/** How many past messages to load for cross-session conversation recall. */
const CONVERSATION_RECALL_CAP = 200;

/** Abort controller for the in-flight stream. Kept outside Zustand state. */
let currentAbort: AbortController | null = null;

/** Debounce timer for the post-turn background memory review. */
let memoryReviewTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce timer for the post-turn background skill review (the learning loop). */
let skillReviewTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced background skill review for the just-finished exchange. */
function scheduleSkillReview(transcript: string, assistantText: string, executedToolSummaries: string[]): void {
  const settings = useSettingsStore.getState().settings;
  if (!settings.assistantMemoryEnabled) return; // the learning loop shares the memory toggle
  if (executedToolSummaries.length < 2) return; // gate also enforces this; cheap early-out
  if (skillReviewTimer) clearTimeout(skillReviewTimer);
  skillReviewTimer = setTimeout(() => {
    skillReviewTimer = null;
    const aux = settings.assistantMemoryModel.trim() || settings.aiModel;
    void runSkillReview({
      settings: { ...settings, aiModel: aux },
      transcript,
      assistantText,
      executedToolSummaries,
      existing: useAssistantStore.getState().skills ?? []
    })
      .then(() => useAssistantStore.getState().loadSkills(true)) // refresh cache with new learning
      .catch(() => {});
  }, SKILL_REVIEW_DEBOUNCE_MS);
}

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

/**
 * Persist a finalized message against the active session and bump the session's
 * activity timestamp so it sorts to the top of the history list. Best-effort:
 * the in-memory conversation is the source of truth for the live UI.
 */
function persistMessage(message: ChatMessage): void {
  const sessionId = useAssistantStore.getState().activeSessionId;
  void assistantMessageRepository.append(message, sessionId).catch(() => {});
  if (!sessionId) return;
  void assistantSessionRepository
    .touch(sessionId, new Date().toISOString())
    .then(() => useAssistantStore.getState().loadSessions(true))
    .catch(() => {});
}

/**
 * Make sure there is a persisted session to attach messages to before the first
 * send of a thread. Creates one lazily (titled from the user's first message) so
 * blank "New chat" threads never hit the database. Subsequent sends only fill in
 * a missing title. Returns the active session id.
 */
async function ensureActiveSession(firstUserText: string): Promise<string> {
  const store = useAssistantStore;
  const existing = store.getState().activeSessionId;
  const title = deriveSessionTitle(firstUserText);
  if (existing) {
    if (title) {
      void assistantSessionRepository
        .setTitleIfEmpty(existing, title)
        .then(() => store.getState().loadSessions(true))
        .catch(() => {});
    }
    return existing;
  }
  const id = createId("ses");
  store.setState({ activeSessionId: id });
  try {
    await assistantSessionRepository.create({ id, title, createdAt: new Date().toISOString() });
  } catch {
    // best-effort: messages still render in-memory even if the row can't persist
  }
  void store.getState().loadSessions(true);
  return id;
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
  skills: AssistantSkill[] | null;
  conversations: ConversationRecallEntry[] | null;
  streamingMessageId: string | null;
  activeSessionId: string | null;
  sessions: AssistantSession[] | null;
  hydrate: () => Promise<void>;
  loadSessions: (force?: boolean) => Promise<void>;
  newSession: () => void;
  switchSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  send: (text: string, modelText?: string) => Promise<void>;
  stop: () => void;
  regenerateLast: () => Promise<void>;
  editUserMessage: (messageId: string, newContent: string) => Promise<void>;
  applyToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  applyAllToolCalls: (messageId: string) => Promise<void>;
  revertToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  dismissToolCall: (messageId: string, toolCallId: string) => void;
  clear: () => void;
  loadInsights: () => Promise<void>;
  loadHistory: () => Promise<void>;
  loadMemories: (force?: boolean) => Promise<void>;
  loadSkills: (force?: boolean) => Promise<void>;
  loadConversations: (force?: boolean) => Promise<void>;
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

function canApplyToolCall(status: ToolCallRecord["status"]): boolean {
  return status === "pending" || status === "dismissed" || status === "reverted" || status === "failed";
}

type ApplyOutcome = { ok: true } | { ok: false; error: string; cancelled?: boolean };

/**
 * Execute one queued write against the live store. On success it patches the
 * call to `executed`; on failure it returns the error WITHOUT marking the card
 * failed, so a batch can retry it once other changes free up the schedule.
 */
async function attemptToolCallApply(
  messageId: string,
  call: ToolCallRecord,
  get: () => AssistantState,
  set: (partial: Partial<AssistantState>) => void
): Promise<ApplyOutcome> {
  const tool = toolByName(call.name);
  if (!tool || tool.category !== "write") return { ok: false, error: "Tool is unavailable" };

  if (isDestructive(tool, call.args)) {
    const confirmed = await useUiStore.getState().confirm({
      message: `${call.summary}?`,
      confirmLabel: "Apply",
      danger: true
    });
    if (!confirmed) return { ok: false, error: "Not confirmed", cancelled: true };
  }

  const parsed = tool.parameters.safeParse(call.args);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid tool arguments" };

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
    if (!result.ok) return { ok: false, error: result.error };

    await adapter.refresh();
    set({
      messages: patchToolCall(get().messages, messageId, call.id, {
        status: "executed",
        summary: result.summary,
        result: result.summary,
        undo: result.undo,
        expectedUpdatedAt: expectedUpdatedAtFor({ undo: result.undo })
      })
    });
    // Flash the affected card in the (now visible) task list so the user sees
    // exactly what landed. Both undo kinds carry the task id; reads/pause don't.
    const affectedTaskId = result.undo?.taskId;
    if (affectedTaskId) useUiStore.getState().highlightTask(affectedTaskId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not apply this change" };
  }
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  messages: [],
  status: "idle",
  error: null,
  steps: [],
  insights: null,
  history: null,
  memories: null,
  skills: null,
  conversations: null,
  streamingMessageId: null,
  activeSessionId: null,
  sessions: null,

  hydrate: async () => {
    if (get().messages.length > 0 || get().activeSessionId) return; // already loaded this session
    try {
      const sessions = await assistantSessionRepository.list();
      set({ sessions });
      const latest = sessions[0];
      if (!latest) return; // no history yet — the first send creates a session
      const restored = restoreHistoryActions(
        await assistantMessageRepository.getBySession(latest.id, HISTORY_LIMIT)
      );
      // Don't clobber a conversation the user started while we were loading.
      if (get().messages.length === 0 && !get().activeSessionId) {
        set({ activeSessionId: latest.id, messages: restored });
      }
    } catch {
      // Best-effort: a fresh conversation is fine if history can't be loaded.
    }
  },

  loadSessions: async (force = false) => {
    if (!force && get().sessions) return; // cached for the session
    try {
      set({ sessions: await assistantSessionRepository.list() });
    } catch {
      set({ sessions: [] }); // best-effort
    }
  },

  /** Start a fresh, empty thread. The session row is created lazily on first send
   *  so we never accumulate empty sessions. No-op when already on a blank thread. */
  newSession: () => {
    if (get().messages.length === 0 && !get().activeSessionId) return;
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    set({
      activeSessionId: null,
      messages: [],
      status: "idle",
      error: null,
      steps: [],
      streamingMessageId: null
    });
  },

  switchSession: async (id) => {
    if (get().activeSessionId === id) return;
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    try {
      const restored = restoreHistoryActions(
        await assistantMessageRepository.getBySession(id, HISTORY_LIMIT)
      );
      set({
        activeSessionId: id,
        messages: restored,
        status: "idle",
        error: null,
        steps: [],
        streamingMessageId: null
      });
    } catch {
      // Leave the current thread in place if the switch can't load.
    }
  },

  renameSession: async (id, title) => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    try {
      await assistantSessionRepository.rename(id, trimmed);
    } catch {
      // best-effort
    }
    await get().loadSessions(true);
  },

  deleteSession: async (id) => {
    try {
      await assistantSessionRepository.delete(id);
    } catch {
      // best-effort
    }
    await get().loadSessions(true);
    if (get().activeSessionId !== id) return;
    // The active thread was deleted — fall back to the most recent remaining
    // session, or a blank new thread if none are left.
    const next = (get().sessions ?? []).find((session) => session.id !== id);
    if (next) {
      await get().switchSession(next.id);
    } else {
      set({ activeSessionId: null, messages: [], status: "idle", error: null, steps: [], streamingMessageId: null });
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
    await ensureActiveSession(trimmed);
    persistMessage(userMessage);
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
    persistMessage(edited);
    await runStreamFrom(kept);
  },

  applyToolCall: async (messageId, toolCallId) => {
    const message = get().messages.find((entry) => entry.id === messageId);
    const call = message?.toolCalls?.find((entry) => entry.id === toolCallId);
    if (!call || !canApplyToolCall(call.status)) return;

    const outcome = await attemptToolCallApply(messageId, call, get, set);
    if (!outcome.ok && !outcome.cancelled) {
      set({
        messages: patchToolCall(get().messages, messageId, toolCallId, {
          status: "failed",
          error: outcome.error,
          result: outcome.error
        })
      });
      useUiStore.getState().addToast({ kind: "error", title: "Could not apply", description: outcome.error });
    }
  },

  applyAllToolCalls: async (messageId) => {
    // Apply every queued change in one go. Reschedules in a batch can briefly
    // collide while the OTHER task still sits in its old slot, so we make
    // repeated passes: each task that lands frees its slot for the next, and we
    // stop once a full pass makes no progress. Whatever still can't apply is a
    // genuine conflict and is surfaced as failed.
    const batchable = (status: ToolCallRecord["status"]) => status === "pending" || status === "failed";
    const errors = new Map<string, string>();
    const skip = new Set<string>(); // destructive/cancelled cards: attempt once, never re-prompt
    let appliedCount = 0;

    for (;;) {
      const message = get().messages.find((entry) => entry.id === messageId);
      const pending = (message?.toolCalls ?? []).filter((call) => batchable(call.status) && !skip.has(call.id));
      if (pending.length === 0) break;

      let progressed = false;
      for (const call of pending) {
        const outcome = await attemptToolCallApply(messageId, call, get, set);
        if (outcome.ok) {
          progressed = true;
          appliedCount += 1;
          errors.delete(call.id);
        } else {
          const tool = toolByName(call.name);
          if (outcome.cancelled) {
            skip.add(call.id);
            errors.delete(call.id);
          } else {
            errors.set(call.id, outcome.error);
            if (tool && isDestructive(tool, call.args)) skip.add(call.id); // don't re-prompt
          }
        }
      }
      if (!progressed) break;
    }

    const finalMessage = get().messages.find((entry) => entry.id === messageId);
    let failedCount = 0;
    for (const call of finalMessage?.toolCalls ?? []) {
      if (batchable(call.status) && errors.has(call.id)) {
        failedCount += 1;
        set({
          messages: patchToolCall(get().messages, messageId, call.id, {
            status: "failed",
            error: errors.get(call.id),
            result: errors.get(call.id)
          })
        });
      }
    }

    if (appliedCount > 0) {
      useUiStore.getState().addToast({
        kind: failedCount > 0 ? "info" : "success",
        title:
          failedCount > 0
            ? `Applied ${appliedCount}, ${failedCount} still conflict`
            : `Applied ${appliedCount} change${appliedCount === 1 ? "" : "s"}`
      });
    } else if (failedCount > 0) {
      useUiStore.getState().addToast({
        kind: "error",
        title: "Couldn't apply these changes",
        description: "They conflict with your current schedule."
      });
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

  loadSkills: async (force = false) => {
    if (!force && get().skills) return; // cached for the session
    try {
      set({ skills: await assistantSkillRepository.getActive() });
    } catch {
      set({ skills: [] }); // best-effort
    }
  },

  loadConversations: async (force = false) => {
    if (!force && get().conversations) return; // cached for the session
    try {
      const recent = await assistantMessageRepository.getRecent(CONVERSATION_RECALL_CAP);
      const conversations: ConversationRecallEntry[] = recent
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
          createdAt: message.createdAt
        }));
      set({ conversations });
    } catch {
      set({ conversations: [] }); // best-effort
    }
  },

  refreshInsights: async () => {
    try {
      set({ insights: await buildRetrospectiveInsights() });
    } catch {
      set({ insights: null });
    }
  },

  /** Clear the *current* thread: delete its session + messages, then drop back
   *  to a blank new thread. A no-op session (never sent) just resets in memory. */
  clear: () => {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    const sessionId = get().activeSessionId;
    set({ messages: [], status: "idle", error: null, steps: [], streamingMessageId: null, activeSessionId: null });
    if (sessionId) {
      void assistantSessionRepository
        .delete(sessionId)
        .then(() => get().loadSessions(true))
        .catch(() => {});
    }
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
  await store.getState().loadSkills();
  await store.getState().loadConversations();

  const lastUserText = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const rankedMemories = rankMemories(store.getState().memories ?? [], lastUserText, MEMORY_INJECT_K);
  const rankedSkills = rankSkills(store.getState().skills ?? [], lastUserText, SKILL_INJECT_K);
  const turnSnapshot = { ...snapshot(), learnedMemories: rankedMemories, learnedSkills: rankedSkills };

  currentAbort = new AbortController();
  const controller = currentAbort;
  const signal = controller.signal;
  store.setState({ status: "thinking", error: null, steps: [], streamingMessageId: null });

  const onStep = (label: string) => store.setState((state) => ({ steps: [...state.steps, label] }));

  // Live-streaming placeholder for the final assistant answer. Created on the
  // first final-answer token (optimistically) and confirmed by onStreamStep
  // "final"; discarded if a step turns out to be tool reasoning ("reasoning"),
  // so tool-step text never leaks into the assistant bubble.
  let streamingId: string | null = null;

  function beginStreaming(): string {
    const id = createId("msg");
    streamingId = id;
    store.setState((state) => ({
      messages: [
        ...state.messages,
        { id, role: "assistant", content: "", createdAt: new Date().toISOString() }
      ],
      status: "streaming",
      streamingMessageId: id
    }));
    return id;
  }

  const onToken = (chunk: string) => {
    if (signal.aborted) return;
    const id = streamingId ?? beginStreaming();
    store.setState((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m))
    }));
  };

  const onStreamStep = (_stepIndex: number, kind: "reasoning" | "final") => {
    if (signal.aborted) return;
    if (kind === "reasoning") {
      // A tool step completed — any optimistically-created placeholder held
      // tool-step text (e.g. the {tool_calls:...} JSON from the fallback path),
      // not the final answer. Discard it and drop back to the folded reasoning
      // view while the loop continues.
      if (streamingId) {
        const id = streamingId;
        streamingId = null;
        store.setState((state) => ({
          messages: state.messages.filter((m) => m.id !== id),
          status: "thinking",
          streamingMessageId: null
        }));
      }
    } else if (!streamingId) {
      // Final-answer phase with no tokens emitted yet (e.g. an empty final) —
      // create the placeholder so finalization can find it.
      beginStreaming();
    }
  };

  function finalizeAbort(partialContent: string, toolCalls: ToolCallRecord[]): void {
    const hasExecuted = toolCalls.some((call) => call.status === "executed");
    const hasContent = partialContent.trim().length > 0;
    const shouldPersist = hasContent || hasExecuted;
    if (streamingId) {
      const id = streamingId;
      store.setState((state) => ({
        messages: state.messages.map((m) =>
          m.id === id
            ? {
                ...m,
                content: partialContent,
                stopped: true,
                toolCalls: toolCalls.length > 0 ? toolCalls : m.toolCalls
              }
            : m
        ),
        status: "idle",
        streamingMessageId: null,
        steps: []
      }));
      if (shouldPersist) {
        const finalized = store.getState().messages.find((m) => m.id === id);
        if (finalized) persistMessage(finalized);
      } else {
        store.setState((state) => ({ messages: state.messages.filter((m) => m.id !== id) }));
      }
    } else if (shouldPersist) {
      const msg: ChatMessage = {
        id: createId("msg"),
        role: "assistant",
        content: partialContent,
        createdAt: new Date().toISOString(),
        toolCalls,
        stopped: true
      };
      store.setState((state) => ({
        messages: [...state.messages, msg],
        status: "idle",
        streamingMessageId: null,
        steps: []
      }));
      persistMessage(msg);
    } else {
      store.setState({ status: "idle", streamingMessageId: null, steps: [] });
    }
    if (currentAbort === controller) currentAbort = null;
  }

  function currentPartialContent(): string {
    if (!streamingId) return "";
    return store.getState().messages.find((m) => m.id === streamingId)?.content ?? "";
  }

  try {
    const adapter = createAgentTaskStore();
    const result = await runAssistantToolTurn(
      {
        settings: useSettingsStore.getState().settings,
        snapshot: turnSnapshot,
        messages: toChatTurns(history),
        insights: store.getState().insights,
        history: store.getState().history ?? [],
        conversations: store.getState().conversations ?? [],
        onStep,
        onToken,
        onStreamStep,
        signal
      },
      { store: adapter, generateChatV2: streamChatV2 }
    );

    if (signal.aborted || currentAbort !== controller) {
      // Abort: finalize the streaming placeholder as a stopped message,
      // preserving any partial content and already-executed tool records.
      finalizeAbort(currentPartialContent(), result.toolCalls);
      return;
    }

    if (result.toolCalls.some((call) => call.status === "executed")) {
      await adapter.refresh();
    }

    const finalContent = result.reply;
    if (streamingId) {
      // Finalize the streaming placeholder in place with the authoritative reply.
      const id = streamingId;
      store.setState((state) => ({
        messages: state.messages.map((m) =>
          m.id === id
            ? { ...m, content: finalContent.length > 0 ? finalContent : m.content, toolCalls: result.toolCalls }
            : m
        ),
        status: "idle",
        streamingMessageId: null,
        steps: []
      }));
      const finalized = store.getState().messages.find((m) => m.id === id);
      if (finalized) persistMessage(finalized);
    } else {
      // No streaming happened (text-fallback / no tokens) — append the assistant message.
      const msg: ChatMessage = {
        id: createId("msg"),
        role: "assistant",
        content: finalContent,
        createdAt: new Date().toISOString(),
        toolCalls: result.toolCalls
      };
      store.setState((state) => ({
        messages: [...state.messages, msg],
        status: "idle",
        streamingMessageId: null,
        steps: []
      }));
      persistMessage(msg);
    }
    if (finalContent.trim().length > 0) {
      scheduleMemoryReview(lastUserText, finalContent);
      const executedToolSummaries = result.toolCalls
        .filter((call) => call.status === "executed")
        .map((call) => call.summary);
      scheduleSkillReview(`User: ${lastUserText}\nAssistant: ${finalContent}`, finalContent, executedToolSummaries);
    }
    currentAbort = null;
  } catch (error) {
    if (isAbortError(error) || signal.aborted || currentAbort !== controller) {
      // Abort on a thrown error path: finalize the placeholder rather than
      // silently dropping it. Executed tool records from earlier steps are
      // not recoverable here (the loop threw) — content is preserved.
      finalizeAbort(currentPartialContent(), []);
      return;
    } else {
      const message = error instanceof Error ? error.message : "The assistant ran into a problem";
      const id = streamingId;
      store.setState((state) => ({
        messages: id ? state.messages.filter((m) => m.id !== id) : state.messages,
        status: "error",
        error: message,
        steps: [],
        streamingMessageId: null
      }));
      useUiStore.getState().addToast({ kind: "error", title: "Assistant error", description: message });
      currentAbort = null;
    }
  }
}
