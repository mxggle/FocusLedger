import { z } from "zod";
import { snapshot } from "./helpers";
import { requireTask } from "./taskRef";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({
  task_id: z.string().min(1),
  note: z.string().optional()
});

export const completeTaskTool: AgentTool = {
  name: "complete_task",
  category: "write",
  destructive: false,
  description: "Mark an existing task done, optionally adding a completion note.",
  paramsHint: "task_id (required), note (optional)",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      const found = requireTask(deps, args.task_id);
      if ("error" in found) return { ok: false, error: found.error };
      const task = found.task;
      const before = snapshot(task);
      const result = await deps.store.completeTask(task.id, args.note);
      if (!result.ok) return { ok: false, error: result.message ?? "complete failed" };
      return {
        ok: true,
        summary: `Marked "${task.title}" done`,
        undo: { kind: "restore_task", taskId: task.id, before }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid complete" };
    }
  }
};
