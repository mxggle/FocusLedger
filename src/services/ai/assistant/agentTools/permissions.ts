import type { AgentTool, PermissionLevel } from "./types";

/** Whether this specific call is destructive, honoring per-call overrides. */
export function isDestructive(tool: AgentTool, args: unknown): boolean {
  return tool.destructiveFor ? tool.destructiveFor(args) : tool.destructive;
}

/** Whether a tool call must be deferred to a user confirm card instead of executing in-loop. */
export function needsConfirm(tool: AgentTool, level: PermissionLevel, args?: unknown): boolean {
  if (tool.category === "read") return false;
  if (level === "auto") return isDestructive(tool, args);
  return true;
}
