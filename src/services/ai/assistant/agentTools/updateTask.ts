import { z } from "zod";
import type { UpdateTaskInput } from "../../../../types";
import { findTask, HHMM_RE, resolveCategoryId, resolveDueDate, snapshot } from "./helpers";
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

export const updateTaskTool: AgentTool = {
  name: "update_task",
  category: "write",
  destructive: false,
  description:
    'Change one or more fields of an existing task: title, description, category, priority, estimated_minutes, due_date, planned_start_time/planned_end_time ("HH:mm"), or status. Use this to recategorize, re-estimate, reschedule the day, or shift start/end times.',
  paramsHint:
    'task_id (required) + any of: title, description, category, priority(low|medium|high), estimated_minutes, due_date("today"|YYYY-MM-DD|null), planned_start_time("HH:mm"|null), planned_end_time("HH:mm"|null), status',
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    const args = schema.parse(rawArgs);
    const task = findTask(deps, args.task_id);
    if (!task) return { ok: false, error: `Unknown task_id "${args.task_id}"` };

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
      if (args.status !== undefined) {
        changes.status = args.status;
        parts.push(`status ${args.status}`);
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

      if (parts.length === 0) return { ok: false, error: "Provide at least one field to change" };

      const before = snapshot(task);
      const result = await deps.store.updateTask(args.task_id, changes);
      if (!result.ok) return { ok: false, error: result.message ?? "update failed" };

      return {
        ok: true,
        summary: `Updated "${task.title}": ${parts.join(", ")}`,
        undo: { kind: "restore_task", taskId: args.task_id, before }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid update" };
    }
  }
};
