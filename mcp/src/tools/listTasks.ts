import { z } from "zod";
import { defineTool, jsonResult } from "./types.js";

const TASK_STATUS = z.enum(["todo", "doing", "paused", "done", "dropped"]);

export const listTasksTool = defineTool({
  name: "list_tasks",
  title: "List tasks",
  description:
    "List Yolo tasks. Use `scope` for the common views: 'today' (due today or earlier plus anything in progress), 'backlog' (no due date, not finished), or 'all'. Optionally filter by status, category, or due date.",
  inputSchema: {
    scope: z.enum(["today", "backlog", "all"]).default("all").describe("Which view to list"),
    status: z.array(TASK_STATUS).optional().describe("Only include these statuses"),
    category_id: z.string().optional().describe("Only include tasks in this category"),
    due_on: z.string().optional().describe("YYYY-MM-DD; tasks due on this date (or 'today' anchor)"),
    limit: z.number().int().positive().max(500).optional().describe("Max tasks to return")
  },
  handler: (args, ctx) => {
    const tasks = ctx.tasks.list({
      scope: args.scope,
      status: args.status,
      categoryId: args.category_id,
      dueOn: args.due_on,
      limit: args.limit
    });
    return jsonResult({ count: tasks.length, tasks });
  }
});
