import { z } from "zod";
import { defineTool, errorResult, jsonResult } from "./types.js";
import { reflectionShape, toReflection } from "./reflection.js";

export const dropTaskTool = defineTool({
  name: "drop_task",
  title: "Drop task",
  description:
    "Mark a task dropped (deliberately not doing it). If its focus session is running it is " +
    "stopped first; an optional reflection records why it was dropped.",
  writes: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    task_id: z.string().describe("Id of the task to drop"),
    ...reflectionShape
  },
  handler: (args, ctx) => {
    const task = ctx.tasks.getById(args.task_id);
    if (!task) {
      return errorResult(`Task not found: ${args.task_id}`);
    }

    const result = ctx.session.drop(args.task_id, toReflection(args));
    return jsonResult({ task: ctx.tasks.getById(args.task_id), entry: result.entry });
  }
});
