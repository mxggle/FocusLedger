import { z } from "zod";
import { snapshot } from "./helpers";
import { requireTask } from "./taskRef";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({ task_id: z.string().min(1) });

export const dropTaskTool: AgentTool = {
  name: "drop_task",
  category: "write",
  destructive: true,
  description: "Drop or abandon an existing task. This is destructive and always requires confirmation.",
  paramsHint: "task_id (required)",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      const found = requireTask(deps, args.task_id);
      if ("error" in found) return { ok: false, error: found.error };
      const task = found.task;
      const before = snapshot(task);
      const result = await deps.store.dropTask(task.id);
      if (!result.ok) return { ok: false, error: result.message ?? "drop failed" };
      return {
        ok: true,
        summary: `Dropped "${task.title}"`,
        undo: { kind: "restore_task", taskId: task.id, before }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid drop" };
    }
  }
};
