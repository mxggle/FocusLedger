import type { CreateTaskInput, TaskPriority, TaskStatus } from "../../../types";
import type { ChatRole } from "../providers";
import type { RetrospectiveInsights } from "../../retrospect/types";

export type { ChatRole };

/** The six v1 capabilities. Extend here + add a registry entry in actions.ts. */
export type AssistantActionType =
  | "create_task"
  | "reschedule_task"
  | "move_to_backlog"
  | "drop_task"
  | "complete_task"
  | "start_task";

export type ActionResult = { ok: true } | { ok: false; message: string };

/** Minimal slice of taskStore an action may call. The real store satisfies it
 *  structurally, and tests can pass a mock. */
export interface AssistantTaskStore {
  createTask(input: CreateTaskInput): Promise<ActionResult>;
  rescheduleTask(taskId: string, dueDate: string): Promise<ActionResult>;
  moveTaskToBacklog(taskId: string): Promise<ActionResult>;
  dropTask(taskId: string): Promise<ActionResult>;
  completeTask(taskId: string, note?: string): Promise<ActionResult>;
  startTask(taskId: string): Promise<"started" | "failed">;
}

/** Compact task shape handed to the model. Intentionally camelCase (mapped from
 *  the snake_case Task model) — keep in sync with the context builder. */
export type ContextTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedMinutes: number | null;
  categoryId: string | null;
};

export type AssistantContext = {
  today: string; // date key YYYY-MM-DD
  categories: { id: string; name: string }[];
  tasks: ContextTask[]; // today's tasks
  backlog: ContextTask[]; // capped slice of backlog
  allTasksCount?: number; // total tasks searchable via search_tasks
  retro?: RetrospectiveInsights; // present only when there is history to report
};

/** One proposed change, rendered as a confirm card. `params` is validated. */
export type ProposedAction = {
  id: string;
  type: AssistantActionType;
  params: unknown; // narrowed per-action; opaque at the store boundary
  summary: string; // human label from describe()
  destructive: boolean;
  status: "pending" | "applied" | "dismissed" | "failed";
  error?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string; // user text, or assistant reply (markdown)
  createdAt: string; // ISO
  actions?: ProposedAction[]; // assistant turns only
};

export type AssistantTurnResult = {
  reply: string;
  actions: ProposedAction[];
};
