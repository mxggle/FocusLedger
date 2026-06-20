import type { CreateTaskInput, UpdateTaskInput } from "../../../types";
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

/** Optional free-text field — returns null when absent or blank. */
function optionalStr(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key];
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

function allKnownTasks(ctx: AssistantContext): { id: string; title: string }[] {
  return [...ctx.tasks, ...ctx.backlog, ...ctx.allTaskRefs];
}

function knownTaskId(raw: Record<string, unknown>, ctx: AssistantContext): string {
  const id = str(raw, "task_id");
  if (!allKnownTasks(ctx).some((task) => task.id === id)) {
    throw new Error(`task_id "${id}" is not a known task`);
  }
  return id;
}

function titleOf(id: string, ctx: AssistantContext): string {
  return allKnownTasks(ctx).find((task) => task.id === id)?.title ?? id;
}

function categoryName(id: string, ctx: AssistantContext): string {
  return ctx.categories.find((category) => category.id === id)?.name ?? id;
}

/** Resolve a category reference (id OR name) to an existing id, or mark it as a
 *  new category to be created on apply. */
function resolveCategoryOrNew(
  raw: Record<string, unknown>,
  ctx: AssistantContext
): { category_id: string | null; new_category_name: string | null } {
  const value = raw.category;
  if (typeof value !== "string" || value.trim().length === 0) {
    return { category_id: null, new_category_name: null };
  }
  const needle = value.trim().toLowerCase();
  const match = ctx.categories.find(
    (category) => category.id.toLowerCase() === needle || category.name.toLowerCase() === needle
  );
  if (match) return { category_id: match.id, new_category_name: null };
  return { category_id: null, new_category_name: value.trim() };
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

type CreateParams = CreateTaskInput & { new_category_name: string | null };
type TaskIdParams = { task_id: string; title: string };
type RescheduleParams = { task_id: string; title: string; due_date: string };

const createTask: ActionDescriptor<CreateParams> = {
  type: "create_task",
  destructive: false,
  promptSpec: {
    name: "create_task",
    when: "the user wants a new task added",
    params: 'title (required), description (optional, a sentence or two of detail/acceptance notes), category (optional — an existing category name OR a new project name; a new name will be created on approval), priority ("low"|"medium"|"high", optional), estimated_minutes (number, optional), due_date ("today"|YYYY-MM-DD, optional — omit to put it in the backlog)'
  },
  validate: (raw, ctx) => {
    const priorityRaw = raw.priority;
    const priority =
      priorityRaw === "low" || priorityRaw === "medium" || priorityRaw === "high" ? priorityRaw : undefined;
    const estimate = typeof raw.estimated_minutes === "number" && raw.estimated_minutes > 0
      ? raw.estimated_minutes : null;
    const { category_id, new_category_name } = resolveCategoryOrNew(raw, ctx);
    return {
      title: str(raw, "title"),
      description: optionalStr(raw, "description"),
      category_id,
      new_category_name,
      priority,
      estimated_minutes: estimate,
      due_date: resolveDueDate(raw, ctx)
    };
  },
  describe: (params) => {
    const where = params.due_date ? `for ${params.due_date}` : "in backlog";
    const project = params.new_category_name ? ` in new project "${params.new_category_name}"` : "";
    return `Create task "${params.title}" ${where}${project}`;
  },
  execute: async (params, store) => {
    const { new_category_name, ...rest } = params;
    if (new_category_name) {
      const categoryId = await store.ensureCategory(new_category_name);
      return store.createTask({ ...rest, category_id: categoryId });
    }
    return store.createTask(rest);
  }
};

type UpdateParams = {
  task_id: string;
  title: string; // current title, for the describe() label
  changes: UpdateTaskInput;
  new_category_name: string | null;
  summaryParts: string[];
};

const updateTask: ActionDescriptor<UpdateParams> = {
  type: "update_task",
  destructive: false,
  promptSpec: {
    name: "update_task",
    when: "the user wants to change one or more fields of an EXISTING task (title, description, category, priority, estimate) — use this to categorize or re-prioritize tasks that already exist",
    params:
      'task_id (required), and at least one of: title, description (a sentence; pass "" to clear), category (existing name/id OR a new project name), priority ("low"|"medium"|"high"), estimated_minutes (number)'
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    const changes: UpdateTaskInput = {};
    const parts: string[] = [];

    const title = optionalStr(raw, "title");
    if (title) {
      changes.title = title;
      parts.push(`title → "${title}"`);
    }

    if ("description" in raw) {
      const desc = optionalStr(raw, "description");
      changes.description = desc; // null clears it
      parts.push(desc ? "description updated" : "description cleared");
    }

    const priorityRaw = raw.priority;
    if (priorityRaw === "low" || priorityRaw === "medium" || priorityRaw === "high") {
      changes.priority = priorityRaw;
      parts.push(`priority → ${priorityRaw}`);
    }

    if (typeof raw.estimated_minutes === "number" && raw.estimated_minutes > 0) {
      changes.estimated_minutes = raw.estimated_minutes;
      parts.push(`estimate → ${raw.estimated_minutes}m`);
    }

    let new_category_name: string | null = null;
    if (typeof raw.category === "string" && raw.category.trim().length > 0) {
      const resolved = resolveCategoryOrNew(raw, ctx);
      if (resolved.category_id) {
        changes.category_id = resolved.category_id;
        parts.push(`category → ${categoryName(resolved.category_id, ctx)}`);
      } else if (resolved.new_category_name) {
        new_category_name = resolved.new_category_name;
        parts.push(`category → new "${resolved.new_category_name}"`);
      }
    }

    if (parts.length === 0) {
      throw new Error("update_task needs at least one field to change");
    }
    return { task_id: id, title: titleOf(id, ctx), changes, new_category_name, summaryParts: parts };
  },
  describe: (params) => `Update "${params.title}": ${params.summaryParts.join(", ")}`,
  execute: async (params, store) => {
    let changes = params.changes;
    if (params.new_category_name) {
      const categoryId = await store.ensureCategory(params.new_category_name);
      changes = { ...changes, category_id: categoryId };
    }
    return store.updateTask(params.task_id, changes);
  }
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
  update_task: updateTask,
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
