import type { Task } from "../types";

export type TodayTaskGroups = {
  overdue: Task[];
  today: Task[];
};

/**
 * Split the Today view's tasks into carried-over (overdue) and current-day groups.
 *
 * A task is overdue when it has a due date strictly before `today` and is not the
 * task currently being worked on (`doing`). The actively running task always stays
 * in the today group so it is never surfaced as overdue while it is in progress.
 * Backlog tasks (no due date) and future-dated tasks remain in the today group.
 *
 * Input order is preserved within each group.
 */
export function partitionTodayTasks(tasks: Task[], today: string): TodayTaskGroups {
  const overdue: Task[] = [];
  const todayTasks: Task[] = [];

  for (const task of tasks) {
    if (task.due_date && task.due_date < today && task.status !== "doing") {
      overdue.push(task);
    } else {
      todayTasks.push(task);
    }
  }

  return { overdue, today: todayTasks };
}

/** Whether a task should be presented as overdue in the Today view. */
export function isTaskOverdue(task: Task, today: string): boolean {
  return Boolean(task.due_date && task.due_date < today && task.status !== "doing");
}
