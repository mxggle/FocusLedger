import { z } from "zod";
import { defineTool, errorResult, jsonResult } from "./types.js";

export const getTaskTool = defineTool({
  name: "get_task",
  title: "Get task",
  description:
    "Get one task by id, including its time entries and the total tracked time across all sessions.",
  inputSchema: {
    id: z.string().describe("Task id")
  },
  handler: (args, ctx) => {
    const task = ctx.tasks.getById(args.id);
    if (!task) {
      return errorResult(`Task not found: ${args.id}`);
    }

    const entries = ctx.timeEntries.listForTask(task.id);
    const trackedSeconds = entries.reduce((sum, entry) => sum + (entry.duration_seconds ?? 0), 0);

    return jsonResult({
      task,
      timeEntries: entries,
      trackedSeconds,
      trackedMinutes: Math.round(trackedSeconds / 60)
    });
  }
});
