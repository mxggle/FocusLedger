import type { Task } from "../../../../types";
import { shortTaskId } from "./taskRef";
import type { AgentToolDeps } from "./types";

export const MAX_RESULTS = 40;
export const MAX_SEARCH_RESULTS = 8;

export function categoryLabel(categoryId: string | null, deps: AgentToolDeps): string {
  if (!categoryId) return "uncategorized";
  return deps.store.getCategories().find((category) => category.id === categoryId)?.name ?? categoryId;
}

export function timeLabel(task: Pick<Task, "planned_start_time" | "planned_end_time">): string {
  if (task.planned_start_time && task.planned_end_time) return `${task.planned_start_time}-${task.planned_end_time}`;
  if (task.planned_start_time) return `${task.planned_start_time}-?`;
  if (task.planned_end_time) return `?-${task.planned_end_time}`;
  return "no time";
}

export function taskLine(task: Task, deps: AgentToolDeps): string {
  const due = task.due_date ? `, due ${task.due_date}` : "";
  const estimate = task.estimated_minutes ? `, est ${task.estimated_minutes}m` : "";
  // Short id: 41-char uuids get mangled when models copy them into tool calls.
  return `- [${shortTaskId(task.id)}] "${task.title}" (${task.status}, ${task.priority}, ${timeLabel(task)}${due}, ${categoryLabel(
    task.category_id,
    deps
  )}${estimate})`;
}
