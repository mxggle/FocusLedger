import type { AgentTool, PermissionLevel } from "./types";

/** Whether a tool call must be deferred to a user confirm card instead of executing in-loop. */
export function needsConfirm(tool: AgentTool, level: PermissionLevel): boolean {
  if (tool.category === "read") return false;
  if (level === "auto") return tool.destructive;
  return true;
}
