import { z } from "zod";
import { defineTool, errorResult, jsonResult } from "./types.js";
import type { TaskPatch } from "../repositories/taskRepository.js";
import { isValidDateKey } from "../util/date.js";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const updateTaskTool = defineTool({
  name: "update_task",
  title: "Update task",
  description:
    "Edit fields of an existing task (title, description, category, priority, estimate, due date, planned times). " +
    "Only the fields you pass change. Status is managed by start/pause/complete/drop tools, not here.",
  writes: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    id: z.string().describe("Task id"),
    title: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional().describe("New details; null clears them"),
    category_id: z.string().optional().describe("Category id (see list_categories)"),
    priority: z.enum(["low", "medium", "high"]).optional(),
    estimated_minutes: z.number().int().positive().max(24 * 60).nullable().optional().describe("Estimate in minutes; null clears it"),
    due_date: z.string().nullable().optional().describe("YYYY-MM-DD; 'none' or null moves it to the backlog"),
    planned_start_time: z.string().regex(TIME_PATTERN).nullable().optional().describe("HH:MM; null clears it"),
    planned_end_time: z.string().regex(TIME_PATTERN).nullable().optional().describe("HH:MM; null clears it")
  },
  handler: (args, ctx) => {
    if (!ctx.tasks.getById(args.id)) {
      return errorResult(`Task not found: ${args.id}`);
    }

    const patch: TaskPatch = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description?.trim() || null;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.estimated_minutes !== undefined) patch.estimated_minutes = args.estimated_minutes;
    if (args.planned_start_time !== undefined) patch.planned_start_time = args.planned_start_time;
    if (args.planned_end_time !== undefined) patch.planned_end_time = args.planned_end_time;

    if (args.category_id !== undefined) {
      if (!ctx.categories.getById(args.category_id)) {
        const known = ctx.categories.list().map((c) => c.id).join(", ");
        return errorResult(`Unknown category "${args.category_id}". Valid ids: ${known}`);
      }
      patch.category_id = args.category_id;
    }

    if (args.due_date !== undefined) {
      if (args.due_date === null || args.due_date.toLowerCase() === "none") {
        patch.due_date = null;
      } else if (isValidDateKey(args.due_date)) {
        patch.due_date = args.due_date;
      } else {
        return errorResult(`Invalid due_date "${args.due_date}". Use YYYY-MM-DD, or 'none' for the backlog.`);
      }
    }

    if (Object.keys(patch).length === 0) {
      return errorResult("Nothing to update — pass at least one field besides id.");
    }

    const task = ctx.tasks.update(args.id, patch);
    return jsonResult({ task });
  }
});
