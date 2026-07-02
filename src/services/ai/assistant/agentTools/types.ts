import type { z } from "zod";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../../../../types";
import type { RetrospectiveInsights } from "../../../retrospect/types";
import type { RecallEntry } from "../recallHistory";
import type { AssistantContext } from "../types";

export type ToolCategory = "read" | "write";

export type TaskUndoSnapshot = Pick<
  Task,
  | "title"
  | "description"
  | "category_id"
  | "priority"
  | "estimated_minutes"
  | "due_date"
  | "planned_start_time"
  | "planned_end_time"
  | "status"
  // Lifecycle timestamps must round-trip with status, otherwise reverting a
  // done/dropped task leaves a stale completed_at/dropped_at behind.
  | "completed_at"
  | "dropped_at"
  | "updated_at"
>;

export type UndoOp =
  | { kind: "delete_task"; taskId: string }
  | { kind: "restore_task"; taskId: string; before: TaskUndoSnapshot };

export type ToolResult =
  | { ok: true; summary: string; data?: unknown; undo?: UndoOp }
  | { ok: false; error: string };

export interface AgentTaskStore {
  getAllTasks(): Task[];
  getCategories(): { id: string; name: string }[];
  createTask(input: CreateTaskInput): Promise<{ ok: boolean; id?: string; message?: string }>;
  updateTask(id: string, input: UpdateTaskInput): Promise<{ ok: boolean; message?: string }>;
  deleteTask(id: string): Promise<{ ok: boolean; message?: string }>;
  startTask(id: string): Promise<"started" | "failed">;
  pauseActiveTask(): Promise<{ ok: boolean; message?: string }>;
  completeTask(id: string, note?: string): Promise<{ ok: boolean; message?: string }>;
  dropTask(id: string): Promise<{ ok: boolean; message?: string }>;
  moveTaskToBacklog(id: string): Promise<{ ok: boolean; message?: string }>;
  ensureCategory(name: string): Promise<string>;
  refresh(): Promise<void>;
}

/** A past assistant-conversation message, for cross-session recall. */
export type ConversationRecallEntry = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

/** One write executed earlier in this conversation, eligible for revert. */
export type SessionToolCall = { messageId: string; call: ToolCallRecord };

export type AgentToolDeps = {
  store: AgentTaskStore;
  ctx: AssistantContext;
  insights: RetrospectiveInsights | null;
  history: RecallEntry[];
  conversations?: ConversationRecallEntry[];
  /** Executed writes from earlier in this conversation (oldest first), for revert_changes. */
  sessionToolCalls?: SessionToolCall[];
  /** Notifies the UI that a past tool-call card was reverted by the assistant. */
  onReverted?: (messageId: string, toolCallId: string) => void;
  now: () => string;
};

export type AgentTool = {
  name: string;
  category: ToolCategory;
  /** Static destructiveness. For tools whose risk depends on the arguments
   *  (e.g. update_task only when status→dropped), see `destructiveFor`. */
  destructive: boolean;
  /** Per-call override: returns true when *these* args make the call destructive.
   *  Falls back to `destructive` when absent. */
  destructiveFor?: (args: unknown) => boolean;
  description: string;
  paramsHint: string;
  parameters: z.ZodType<unknown>;
  execute: (args: unknown, deps: AgentToolDeps) => Promise<ToolResult>;
};

export type PermissionLevel = "plan" | "ask" | "auto";

export type ToolCallStatus = "executed" | "pending" | "failed" | "reverted" | "dismissed";

export type ToolCallRecord = {
  id: string;
  name: string;
  args: unknown;
  category: ToolCategory;
  destructive: boolean;
  summary: string;
  targetTitle?: string;
  status: ToolCallStatus;
  result?: string;
  error?: string;
  undo?: UndoOp;
  expectedUpdatedAt?: string;
};
