import { z } from "zod";
import { snapshot } from "./helpers";
import { requireTask } from "./taskRef";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({ task_id: z.string().min(1) });

export const startTaskTool: AgentTool = {
  name: "start_task",
  category: "write",
  destructive: false,
  description: "Start a focus session on an existing task.",
  paramsHint: "task_id (required)",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      const found = requireTask(deps, args.task_id);
      if ("error" in found) return { ok: false, error: found.error };
      const task = found.task;
      const before = snapshot(task);
      const result = await deps.store.startTask(task.id);
      if (result !== "started") return { ok: false, error: "start failed" };
      return {
        ok: true,
        summary: `Started focus on "${task.title}"`,
        undo: { kind: "restore_task", taskId: task.id, before }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid start" };
    }
  }
};
