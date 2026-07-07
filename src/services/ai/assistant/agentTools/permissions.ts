import { resolveTaskRef, unknownTaskRefError } from "./taskRef";
import type { AgentTool, AgentToolDeps, PermissionLevel } from "./types";

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

/**
 * Validate a write before it is queued on a confirmation card. A call whose
 * task_id resolves to nothing can never apply — failing it back to the model
 * NOW, in-conversation, lets it correct the id and re-issue; queued unchecked
 * it only explodes later, when the user clicks Apply and the model is no
 * longer in the loop. Returns the error string, or null when queueable.
 */
export function queuedWriteError(args: unknown, deps: AgentToolDeps): string | null {
  if (typeof args !== "object" || args === null) return null;
  const ref = (args as { task_id?: unknown }).task_id;
  if (typeof ref !== "string" || ref.length === 0) return null;
  const tasks = deps.store.getAllTasks();
  return resolveTaskRef(tasks, ref) ? null : unknownTaskRefError(tasks, ref);
}
