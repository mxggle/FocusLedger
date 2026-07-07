import { z } from "zod";
import type { Task, TaskStatus, UpdateTaskInput } from "../../../../types";
import { HHMM_RE, resolveCategoryId, resolveDueDate, snapshot } from "./helpers";
import { requireTask } from "./taskRef";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({
  task_id: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  estimated_minutes: z.number().positive().optional(),
  due_date: z.string().nullable().optional(),
  planned_start_time: z.string().nullable().optional(),
  planned_end_time: z.string().nullable().optional(),
  status: z.enum(["todo", "doing", "paused", "done", "dropped"]).optional()
});

function checkTime(value: string | null | undefined, label: string): void {
  if (typeof value === "string" && value !== "" && !HHMM_RE.test(value)) {
    throw new Error(`${label} must be HH:mm`);
  }
}

type StoreOutcome = { ok: boolean; error?: string };

function wrap(result: { ok: boolean; message?: string }): StoreOutcome {
  return result.ok ? { ok: true } : { ok: false, error: result.message ?? "status change failed" };
}

/**
 * Apply a status transition through the dedicated lifecycle methods so it stays
 * consistent with start/pause/complete/drop: those close any open time entry and
 * set completed_at/dropped_at. A raw status write would skip both and leave a
 * "done" task with a still-running timer and a null completed_at.
 */
async function applyStatusChange(deps: AgentToolDeps, task: Task, status: TaskStatus): Promise<StoreOutcome> {
  switch (status) {
    case "done":
      return wrap(await deps.store.completeTask(task.id));
    case "dropped":
      return wrap(await deps.store.dropTask(task.id));
    case "doing": {
      const result = await deps.store.startTask(task.id);
      return result === "started" ? { ok: true } : { ok: false, error: "could not start task" };
    }
    case "paused":
      // Only the running task has an open entry to close; otherwise just set the flag.
      if (task.status === "doing") return wrap(await deps.store.pauseActiveTask());
      return wrap(await deps.store.updateTask(task.id, { status: "paused", completed_at: null, dropped_at: null }));
    case "todo":
      return wrap(await deps.store.updateTask(task.id, { status: "todo", completed_at: null, dropped_at: null }));
    default:
      return { ok: false, error: `unsupported status "${status}"` };
  }
}

export const updateTaskTool: AgentTool = {
  name: "update_task",
  category: "write",
  destructive: false,
  // Dropping a task is destructive even though the tool itself is usually not,
  // so it must clear the same confirmation gate as drop_task instead of slipping
  // through update_task in auto mode.
  destructiveFor: (rawArgs) => {
    const parsed = schema.safeParse(rawArgs);
    return parsed.success && parsed.data.status === "dropped";
  },
  description:
    'Change one or more fields of an existing task: title, description, category, priority, estimated_minutes, due_date, planned_start_time/planned_end_time ("HH:mm"), or status. Use this to recategorize, re-estimate, reschedule the day, or shift start/end times. A status change runs the same lifecycle as start/pause/complete/drop (closing open timers, stamping completion).',
  paramsHint:
    'task_id (required) + any of: title, description, category, priority(low|medium|high), estimated_minutes, due_date("today"|"yesterday"|"tomorrow"|YYYY-MM-DD|null), planned_start_time("HH:mm"|null), planned_end_time("HH:mm"|null), status',
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    const args = schema.parse(rawArgs);
    const found = requireTask(deps, args.task_id);
    if ("error" in found) return { ok: false, error: found.error };
    const task = found.task;

    try {
      checkTime(args.planned_start_time, "planned_start_time");
      checkTime(args.planned_end_time, "planned_end_time");

      const changes: UpdateTaskInput = {};
      const parts: string[] = [];

      if (args.title !== undefined) {
        changes.title = args.title;
        parts.push("title");
      }
      if (args.description !== undefined) {
        changes.description = args.description;
        parts.push("description");
      }
      if (args.priority !== undefined) {
        changes.priority = args.priority;
        parts.push(`priority ${args.priority}`);
      }
      if (args.estimated_minutes !== undefined) {
        changes.estimated_minutes = args.estimated_minutes;
        parts.push(`est ${args.estimated_minutes}m`);
      }
      if (args.due_date !== undefined) {
        changes.due_date = resolveDueDate(deps, args.due_date);
        parts.push(changes.due_date ? `due ${changes.due_date}` : "backlog");
      }
      if (args.planned_start_time !== undefined) {
        changes.planned_start_time = args.planned_start_time || null;
        parts.push(`start ${changes.planned_start_time ?? "cleared"}`);
      }
      if (args.planned_end_time !== undefined) {
        changes.planned_end_time = args.planned_end_time || null;
        parts.push(`end ${changes.planned_end_time ?? "cleared"}`);
      }
      if (args.category !== undefined) {
        const { createName, id } = resolveCategoryId(deps, args.category);
        changes.category_id = id ?? (createName ? await deps.store.ensureCategory(createName) : null);
        parts.push("category");
      }

      const statusChange = args.status !== undefined && args.status !== task.status ? args.status : undefined;
      if (parts.length === 0 && !statusChange) return { ok: false, error: "Provide at least one field to change" };

      const before = snapshot(task);

      // Field edits go through the plain update; the status transition is routed
      // through its lifecycle method afterwards so both end up applied.
      if (parts.length > 0) {
        const result = await deps.store.updateTask(task.id, changes);
        if (!result.ok) return { ok: false, error: result.message ?? "update failed" };
      }

      if (statusChange) {
        const transition = await applyStatusChange(deps, task, statusChange);
        if (!transition.ok) return { ok: false, error: transition.error ?? "status change failed" };
        parts.push(`status ${statusChange}`);
      }

      return {
        ok: true,
        summary: `Updated "${task.title}": ${parts.join(", ")}`,
        undo: { kind: "restore_task", taskId: task.id, before }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid update" };
    }
  }
};
