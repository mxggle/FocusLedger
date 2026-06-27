import { z } from "zod";
import { findTask, taskLine } from "./readHelpers";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({ task_id: z.string().min(1) });

export const getTaskTool: AgentTool = {
  name: "get_task",
  category: "read",
  destructive: false,
  description: "Fetch full details for one task, including planned start/end times.",
  paramsHint: "task_id (required)",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      const task = findTask(deps, args.task_id);
      if (!task) return { ok: false, error: `Unknown task_id "${args.task_id}"` };
      return { ok: true, summary: taskLine(task, deps), data: task };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid get_task args" };
    }
  }
};
