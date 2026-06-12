import { z } from "zod";
import { defineTool, errorResult, jsonResult } from "./types.js";
import { reflectionShape, toReflection } from "./reflection.js";

export const completeTaskTool = defineTool({
  name: "complete_task",
  title: "Complete task",
  description:
    "Mark a task done. If its focus session is running it is stopped, and the optional " +
    "reflection (note / blocker / next_action / completion_rate) is saved on the session's " +
    "time entry as the stop-note.",
  writes: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    task_id: z.string().describe("Id of the task to complete"),
    ...reflectionShape
  },
  handler: (args, ctx) => {
    const task = ctx.tasks.getById(args.task_id);
    if (!task) {
      return errorResult(`Task not found: ${args.task_id}`);
    }

    const result = ctx.session.complete(args.task_id, toReflection(args));
    return jsonResult({ task: ctx.tasks.getById(args.task_id), entry: result.entry });
  }
});
