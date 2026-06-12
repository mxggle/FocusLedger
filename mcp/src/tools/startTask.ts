import { z } from "zod";
import { defineTool, errorResult, jsonResult } from "./types.js";

export const startTaskTool = defineTool({
  name: "start_task",
  title: "Start focus",
  description:
    "Start (or resume) a focus session on a task. Only one session runs at a time: " +
    "anything currently running is auto-paused first. Restarting the same task within " +
    "a short window continues its previous block instead of opening a new one.",
  writes: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    task_id: z.string().describe("Id of the task to focus on")
  },
  handler: (args, ctx) => {
    const task = ctx.tasks.getById(args.task_id);
    if (!task) {
      return errorResult(`Task not found: ${args.task_id}`);
    }
    if (task.status === "done" || task.status === "dropped") {
      return errorResult(
        `Task "${task.title}" is already ${task.status}. Create a follow-up with add_task instead.`
      );
    }

    const result = ctx.session.start(args.task_id);
    return jsonResult({
      task: ctx.tasks.getById(args.task_id),
      entry: result.entry,
      pausedTaskId: result.pausedTaskId,
      resumedPreviousBlock: result.resumedPreviousBlock
    });
  }
});
