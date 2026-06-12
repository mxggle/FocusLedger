import { defineTool, jsonResult } from "./types.js";

export const pauseTaskTool = defineTool({
  name: "pause_task",
  title: "Pause focus",
  description:
    "Pause the currently running focus session, if any. The task stays in today's list " +
    "as paused; a block too short to matter is discarded rather than logged.",
  writes: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: {},
  handler: (_args, ctx) => {
    const result = ctx.session.pauseActive();
    if (!result.pausedTaskId) {
      return jsonResult({ paused: false, message: "No focus session is running." });
    }
    return jsonResult({
      paused: true,
      task: ctx.tasks.getById(result.pausedTaskId),
      entryDiscarded: result.entryDiscarded
    });
  }
});
