import type { Task, TaskPriority } from "../../../../types";
import type { AgentToolDeps, TaskUndoSnapshot } from "./types";

export function findTask(deps: AgentToolDeps, id: string): Task | undefined {
  return deps.store.getAllTasks().find((task) => task.id === id);
}

export function snapshot(task: Task): TaskUndoSnapshot {
  return {
    title: task.title,
    description: task.description,
    category_id: task.category_id,
    priority: task.priority,
    estimated_minutes: task.estimated_minutes,
    due_date: task.due_date,
    planned_start_time: task.planned_start_time,
    planned_end_time: task.planned_end_time,
    status: task.status,
    completed_at: task.completed_at,
    dropped_at: task.dropped_at,
    updated_at: task.updated_at
  };
}

export function resolveCategoryId(
  deps: AgentToolDeps,
  ref: string | undefined
): { id: string | null; createName: string | null } {
  if (!ref || !ref.trim()) return { id: null, createName: null };
  const needle = ref.trim().toLowerCase();
  const match = deps.store
    .getCategories()
    .find((category) => category.id.toLowerCase() === needle || category.name.toLowerCase() === needle);
  return match ? { id: match.id, createName: null } : { id: null, createName: ref.trim() };
}

export function resolveDueDate(deps: AgentToolDeps, ref: string | null | undefined): string | null | undefined {
  if (ref === undefined) return undefined;
  if (ref === null || ref === "") return null;
  const normalized = ref.toLowerCase();
  if (normalized === "today") return deps.ctx.today;
  if (normalized === "yesterday") return shiftDate(deps.ctx.today, -1);
  if (normalized === "tomorrow") return shiftDate(deps.ctx.today, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ref)) return ref;
  throw new Error('due_date must be "today", "yesterday", "tomorrow", or YYYY-MM-DD');
}

export const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function shiftDate(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}
