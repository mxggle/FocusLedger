import type { AgentTaskStore, ToolCallRecord } from "./types";

/** Reverse one executed write. Best-effort; the caller handles drift confirmation. */
export async function revertToolCall(
  rec: ToolCallRecord,
  store: AgentTaskStore
): Promise<{ ok: boolean; message?: string }> {
  if (rec.status !== "executed" || !rec.undo) return { ok: false, message: "Nothing to revert" };
  if (rec.undo.kind === "delete_task") return store.deleteTask(rec.undo.taskId);

  const { before, taskId } = rec.undo;
  // Best-effort: restores the task row including lifecycle status + timestamps.
  // It does not reopen a time entry that was closed when the task was
  // completed/dropped — reversing that is out of scope for a field restore.
  return store.updateTask(taskId, {
    title: before.title,
    description: before.description,
    category_id: before.category_id,
    priority: before.priority,
    estimated_minutes: before.estimated_minutes,
    due_date: before.due_date,
    planned_start_time: before.planned_start_time,
    planned_end_time: before.planned_end_time,
    status: before.status,
    completed_at: before.completed_at,
    dropped_at: before.dropped_at
  });
}

/** True when the live task changed since the action ran (revert would clobber newer edits). */
export function hasDrifted(rec: ToolCallRecord, current: { updated_at: string } | undefined): boolean {
  if (!rec.undo || rec.undo.kind !== "restore_task") return false;
  if (!current) return false;
  if (!rec.expectedUpdatedAt) return false;
  return current.updated_at !== rec.expectedUpdatedAt;
}
