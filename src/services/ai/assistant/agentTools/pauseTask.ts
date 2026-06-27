import { z } from "zod";
import { snapshot } from "./helpers";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({});

export const pauseTaskTool: AgentTool = {
  name: "pause_task",
  category: "write",
  destructive: false,
  description: "Pause the currently running focus task.",
  paramsHint: "{}",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      schema.parse(rawArgs);
      const running = deps.store.getAllTasks().find((task) => task.status === "doing");
      const result = await deps.store.pauseActiveTask();
      if (!result.ok) return { ok: false, error: result.message ?? "pause failed" };
      if (!running) {
        return { ok: true, summary: "No running task to pause" };
      }
      const before = snapshot(running);
      return {
        ok: true,
        summary: `Paused "${running.title}"`,
        undo: { kind: "restore_task", taskId: running.id, before }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid pause" };
    }
  }
};
