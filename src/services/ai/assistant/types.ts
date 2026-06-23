import type { TaskPriority, TaskStatus } from "../../../types";
import type { ChatRole } from "../providers";
import type { RetrospectiveInsights } from "../../retrospect/types";
import type { DayBriefing } from "./dayBriefing";
import type { PermissionLevel, ToolCallRecord } from "./agentTools/types";
import type { MemoryEntry } from "./memory/types";

export type { ChatRole };

/** Compact task shape handed to the model. Intentionally camelCase (mapped from
 *  the snake_case Task model) — keep in sync with the context builder. */
export type ContextTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedMinutes: number | null;
  categoryId: string | null;
  plannedStartTime: string | null;
  plannedEndTime: string | null;
};

export type AssistantContext = {
  today: string; // date key YYYY-MM-DD
  currentTime?: string; // local timestamp captured at the start of the assistant turn
  categories: { id: string; name: string }[];
  tasks: ContextTask[]; // today's tasks
  backlog: ContextTask[]; // capped slice of backlog
  allTasksCount?: number; // total tasks searchable via search_tasks
  assistantName: string; // the assistant's configured name
  assistantSoul: string; // raw SOUL markdown ("" → default soul applied downstream)
  allTaskRefs: { id: string; title: string }[]; // id+title for EVERY task, for id validation
  profile?: string; // the user's own "About me" description, when set
  briefing?: DayBriefing; // deterministic snapshot of today's load
  retro?: RetrospectiveInsights; // present only when there is history to report
  learnedMemories?: MemoryEntry[]; // ranked top-K for this turn (empty/absent → no block)
  permissionLevel?: PermissionLevel;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string; // user text (as displayed), or assistant reply (markdown)
  modelContent?: string; // what to send to the model when it differs from `content` (e.g. Plan-mode wrapping); transient, not persisted
  createdAt: string; // ISO
  toolCalls?: ToolCallRecord[];
  stopped?: boolean; // true when a stream was aborted by the user (transient; not persisted)
};
