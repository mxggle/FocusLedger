import type { CreateTaskInput } from "../../../types";
import { createId } from "../../../utils/id";
import type {
  ActionResult,
  AssistantActionType,
  AssistantContext,
  AssistantTaskStore,
  ProposedAction
} from "./types";

/** Prompt fragment so the model knows when/how to emit an action. */
type PromptSpec = { name: string; when: string; params: string };

type ActionDescriptor<P> = {
  type: AssistantActionType;
  destructive: boolean;
  promptSpec: PromptSpec;
  /** Validate raw LLM params; return typed params or throw with a reason. */
  validate: (raw: Record<string, unknown>, ctx: AssistantContext) => P;
  describe: (params: P, ctx: AssistantContext) => string;
  execute: (params: P, store: AssistantTaskStore) => Promise<ActionResult>;
};

// ── validation helpers ───────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`"${key}" must be a non-empty string`);
  }
  return value.trim();
}

function knownTaskId(raw: Record<string, unknown>, ctx: AssistantContext): string {
  const id = str(raw, "task_id");
  const exists = [...ctx.tasks, ...ctx.backlog].some((task) => task.id === id);
  if (!exists) {
    throw new Error(`task_id "${id}" is not a known task`);
  }
  return id;
}

function titleOf(id: string, ctx: AssistantContext): string {
  return [...ctx.tasks, ...ctx.backlog].find((task) => task.id === id)?.title ?? id;
}

/** Resolve an optional category reference (id OR name) to a real id or null. */
function resolveCategory(raw: Record<string, unknown>, ctx: AssistantContext): string | null {
  const value = raw.category;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const needle = value.trim().toLowerCase();
  const match = ctx.categories.find(
    (category) => category.id.toLowerCase() === needle || category.name.toLowerCase() === needle
  );
  return match ? match.id : null;
}

function resolveDueDate(raw: Record<string, unknown>, ctx: AssistantContext): string | null {
  const value = raw.due_date;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "today") return ctx.today;
  if (DATE_RE.test(value.trim())) return value.trim();
  throw new Error(`due_date "${value}" must be YYYY-MM-DD or "today"`);
}

function requiredDate(raw: Record<string, unknown>, ctx: AssistantContext): string {
  const resolved = resolveDueDate(raw, ctx);
  if (!resolved) throw new Error('"due_date" is required (YYYY-MM-DD or "today")');
  return resolved;
}

// ── action descriptors ───────────────────────────────────────────────────────

type CreateParams = CreateTaskInput;
type TaskIdParams = { task_id: string; title: string };
type RescheduleParams = { task_id: string; title: string; due_date: string };

const createTask: ActionDescriptor<CreateParams> = {
  type: "create_task",
  destructive: false,
  promptSpec: {
    name: "create_task",
    when: "the user wants a new task added",
    params: 'title (required), category (optional, a category name), priority ("low"|"medium"|"high", optional), estimated_minutes (number, optional), due_date ("today"|YYYY-MM-DD, optional — omit to put it in the backlog)'
  },
  validate: (raw, ctx) => {
    const priorityRaw = raw.priority;
    const priority =
      priorityRaw === "low" || priorityRaw === "medium" || priorityRaw === "high" ? priorityRaw : undefined;
    const estimate = typeof raw.estimated_minutes === "number" && raw.estimated_minutes > 0
      ? raw.estimated_minutes : null;
    return {
      title: str(raw, "title"),
      category_id: resolveCategory(raw, ctx),
      priority,
      estimated_minutes: estimate,
      due_date: resolveDueDate(raw, ctx)
    };
  },
  describe: (params) =>
    `Create task "${params.title}"${params.due_date ? ` for ${params.due_date}` : " in backlog"}`,
  execute: (params, store) => store.createTask(params)
};

const rescheduleTask: ActionDescriptor<RescheduleParams> = {
  type: "reschedule_task",
  destructive: false,
  promptSpec: {
    name: "reschedule_task",
    when: "the user wants an existing task moved to a different day",
    params: 'task_id (required), due_date (required, "today"|YYYY-MM-DD)'
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    return { task_id: id, title: titleOf(id, ctx), due_date: requiredDate(raw, ctx) };
  },
  describe: (params) => `Move "${params.title}" to ${params.due_date}`,
  execute: (params, store) => store.rescheduleTask(params.task_id, params.due_date)
};

const moveToBacklog: ActionDescriptor<TaskIdParams> = {
  type: "move_to_backlog",
  destructive: false,
  promptSpec: {
    name: "move_to_backlog",
    when: "the user wants a scheduled task moved off the calendar into the backlog",
    params: "task_id (required)"
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    return { task_id: id, title: titleOf(id, ctx) };
  },
  describe: (params) => `Move "${params.title}" to backlog`,
  execute: (params, store) => store.moveTaskToBacklog(params.task_id)
};

const dropTask: ActionDescriptor<TaskIdParams> = {
  type: "drop_task",
  destructive: true,
  promptSpec: {
    name: "drop_task",
    when: "the user wants to abandon/cancel a task",
    params: "task_id (required)"
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    return { task_id: id, title: titleOf(id, ctx) };
  },
  describe: (params) => `Drop "${params.title}"`,
  execute: (params, store) => store.dropTask(params.task_id)
};

const completeTask: ActionDescriptor<TaskIdParams> = {
  type: "complete_task",
  destructive: false,
  promptSpec: {
    name: "complete_task",
    when: "the user says a task is finished",
    params: "task_id (required)"
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    return { task_id: id, title: titleOf(id, ctx) };
  },
  describe: (params) => `Mark "${params.title}" done`,
  execute: (params, store) => store.completeTask(params.task_id)
};

const startTask: ActionDescriptor<TaskIdParams> = {
  type: "start_task",
  destructive: false,
  promptSpec: {
    name: "start_task",
    when: "the user wants to start focusing on a task right now",
    params: "task_id (required)"
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    return { task_id: id, title: titleOf(id, ctx) };
  },
  describe: (params) => `Start focus on "${params.title}"`,
  execute: async (params, store) => {
    const result = await store.startTask(params.task_id);
    return result === "started"
      ? { ok: true }
      : { ok: false, message: "Could not start the task (another may be running)" };
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ACTION_REGISTRY: Record<AssistantActionType, ActionDescriptor<any>> = {
  create_task: createTask,
  reschedule_task: rescheduleTask,
  move_to_backlog: moveToBacklog,
  drop_task: dropTask,
  complete_task: completeTask,
  start_task: startTask
};

export const ACTION_TYPES = Object.keys(ACTION_REGISTRY) as AssistantActionType[];

export function actionPromptSpecs(): PromptSpec[] {
  return ACTION_TYPES.map((type) => ACTION_REGISTRY[type].promptSpec);
}

/**
 * Validate one raw action object from the model. Returns a ProposedAction
 * (status "pending") or null if the type is unknown or params are invalid —
 * invalid actions are dropped, never thrown, so one bad action can't sink a turn.
 */
export function validateAction(
  raw: unknown,
  ctx: AssistantContext
): ProposedAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string" || !(type in ACTION_REGISTRY)) return null;
  const descriptor = ACTION_REGISTRY[type as AssistantActionType];
  try {
    const params = descriptor.validate(record, ctx);
    return {
      id: createId("act"),
      type: descriptor.type,
      params,
      summary: descriptor.describe(params, ctx),
      destructive: descriptor.destructive,
      status: "pending"
    };
  } catch {
    return null;
  }
}
