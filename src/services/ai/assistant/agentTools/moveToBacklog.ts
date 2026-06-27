import { z } from "zod";
import { findTask, snapshot } from "./helpers";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({ task_id: z.string().min(1) });

export const moveToBacklogTool: AgentTool = {
  name: "move_to_backlog",
  category: "write",
  destructive: false,
  description: "Move an existing task off the calendar into the backlog.",
  paramsHint: "task_id (required)",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      const task = findTask(deps, args.task_id);
      if (!task) return { ok: false, error: `Unknown task_id "${args.task_id}"` };
      const before = snapshot(task);
      const result = await deps.store.moveTaskToBacklog(args.task_id);
      if (!result.ok) return { ok: false, error: result.message ?? "move failed" };
      return {
        ok: true,
        summary: `Moved "${task.title}" to backlog`,
        undo: { kind: "restore_task", taskId: args.task_id, before }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid move" };
    }
  }
};
