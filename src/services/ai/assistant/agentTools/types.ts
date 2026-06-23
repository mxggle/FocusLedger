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

export type AgentToolDeps = {
  store: AgentTaskStore;
  ctx: AssistantContext;
  insights: RetrospectiveInsights | null;
  history: RecallEntry[];
  now: () => string;
};

export type AgentTool = {
  name: string;
  category: ToolCategory;
  destructive: boolean;
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
  status: ToolCallStatus;
  result?: string;
  error?: string;
  undo?: UndoOp;
  expectedUpdatedAt?: string;
};
