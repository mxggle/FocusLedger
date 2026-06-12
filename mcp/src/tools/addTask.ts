import { z } from "zod";
import { defineTool, errorResult, jsonResult } from "./types.js";
import type { TaskRow } from "../db/types.js";
import { isValidDateKey, toDateKey } from "../util/date.js";
import { createId } from "../util/id.js";

const DEFAULT_CATEGORY_ID = "inbox";
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const addTaskTool = defineTool({
  name: "add_task",
  title: "Add task",
  description:
    "Create a new Yolo task. Defaults: due today, medium priority, 'inbox' category. " +
    "Pass due_date 'none' (or null) to send it to the backlog instead.",
  writes: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: {
    title: z.string().trim().min(1).describe("Task title"),
    description: z.string().optional().describe("Longer free-form details"),
    category_id: z.string().optional().describe("Category id (see list_categories); defaults to 'inbox'"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    estimated_minutes: z.number().int().positive().max(24 * 60).optional().describe("Time estimate in minutes"),
    due_date: z
      .string()
      .nullable()
      .optional()
      .describe("YYYY-MM-DD; omit for today, 'none' or null for the backlog"),
    planned_start_time: z.string().regex(TIME_PATTERN).optional().describe("HH:MM planned start"),
    planned_end_time: z.string().regex(TIME_PATTERN).optional().describe("HH:MM planned end")
  },
  handler: (args, ctx) => {
    let dueDate: string | null;
    if (args.due_date === undefined) {
      dueDate = toDateKey();
    } else if (args.due_date === null || args.due_date.toLowerCase() === "none") {
      dueDate = null;
    } else if (isValidDateKey(args.due_date)) {
      dueDate = args.due_date;
    } else {
      return errorResult(`Invalid due_date "${args.due_date}". Use YYYY-MM-DD, or 'none' for the backlog.`);
    }

    const categoryId = args.category_id ?? DEFAULT_CATEGORY_ID;
    if (!ctx.categories.getById(categoryId)) {
      const known = ctx.categories.list().map((c) => c.id).join(", ");
      return errorResult(`Unknown category "${categoryId}". Valid ids: ${known}`);
    }

    const now = new Date().toISOString();
    const task: TaskRow = {
      id: createId("task"),
      title: args.title,
      description: args.description?.trim() || null,
      category_id: categoryId,
      status: "todo",
      priority: args.priority,
      estimated_minutes: args.estimated_minutes ?? null,
      due_date: dueDate,
      template_id: null,
      planned_start_time: args.planned_start_time ?? null,
      planned_end_time: args.planned_end_time ?? null,
      sort_order: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
      dropped_at: null
    };
    ctx.tasks.insert(task);
    return jsonResult({ task });
  }
});
