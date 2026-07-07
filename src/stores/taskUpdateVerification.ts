import type { Task, UpdateTaskInput } from "../types";

const VERIFIED_UPDATE_FIELDS = [
  "title",
  "description",
  "category_id",
  "priority",
  "estimated_minutes",
  "due_date",
  "planned_start_time",
  "planned_end_time",
  "status"
] as const satisfies readonly (keyof UpdateTaskInput)[];

/** Fail closed when a repository write resolves but refreshed application state
 * does not contain the requested values. Call only after the store refreshes. */
export function verifyTaskUpdate(task: Task | undefined, input: UpdateTaskInput): void {
  if (!task) throw new Error("Task disappeared after the update.");
  for (const field of VERIFIED_UPDATE_FIELDS) {
    if (!(field in input)) continue;
    if (task[field] !== input[field]) {
      throw new Error(`Task update was not persisted for ${field}.`);
    }
  }
}
