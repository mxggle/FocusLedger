import { differenceInCalendarDays } from "date-fns";
import type { Category, Task, TaskPriority } from "../types";
import { formatDateLabel } from "./date";

export type BacklogScope = "all" | "backlog" | "scheduled";
export type BacklogGroupBy = "none" | "category" | "priority" | "date";
export type BacklogSortBy = "priority" | "newest" | "oldest" | "shortest" | "date";
export type BacklogViewMode = "cards" | "list" | "board" | "table";

export const BACKLOG_SCOPES: BacklogScope[] = ["all", "backlog", "scheduled"];
export const BACKLOG_GROUPINGS: BacklogGroupBy[] = [
  "none",
  "category",
  "priority",
  "date"
];
export const BACKLOG_SORTS: BacklogSortBy[] = [
  "priority",
  "newest",
  "oldest",
  "shortest",
  "date"
];
export const BACKLOG_VIEW_MODES: BacklogViewMode[] = [
  "cards",
  "list",
  "board",
  "table"
];

export type BacklogFilters = {
  scope: BacklogScope;
  search: string;
  /** Category id, or "all" for no filter. Tasks without a category match "inbox". */
  categoryId: string;
  priority: TaskPriority | "all";
};

export const DEFAULT_BACKLOG_FILTERS: BacklogFilters = {
  scope: "all",
  search: "",
  categoryId: "all",
  priority: "all"
};

export function hasActiveBacklogFilters(filters: BacklogFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.categoryId !== "all" ||
    filters.priority !== "all"
  );
}

export function filterBacklogTasks(
  tasks: Task[],
  filters: BacklogFilters
): Task[] {
  const query = filters.search.trim().toLowerCase();

  return tasks.filter((task) => {
    if (filters.scope === "backlog" && task.due_date) return false;
    if (filters.scope === "scheduled" && !task.due_date) return false;
    if (
      filters.categoryId !== "all" &&
      (task.category_id ?? "inbox") !== filters.categoryId
    ) {
      return false;
    }
    if (filters.priority !== "all" && task.priority !== filters.priority) {
      return false;
    }
    if (query) {
      const haystack = `${task.title} ${task.description ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

const priorityRank: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2
};

export function sortBacklogTasks(tasks: Task[], sortBy: BacklogSortBy): Task[] {
  const sorted = [...tasks];

  switch (sortBy) {
    case "priority":
      sorted.sort(
        (a, b) =>
          priorityRank[a.priority] - priorityRank[b.priority] ||
          b.created_at.localeCompare(a.created_at)
      );
      break;
    case "newest":
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    case "oldest":
      sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
      break;
    case "shortest":
      sorted.sort(
        (a, b) =>
          (a.estimated_minutes ?? Number.MAX_SAFE_INTEGER) -
            (b.estimated_minutes ?? Number.MAX_SAFE_INTEGER) ||
          priorityRank[a.priority] - priorityRank[b.priority]
      );
      break;
    case "date":
      // Dated tasks first (ascending); unscheduled tasks sink to the end.
      sorted.sort(
        (a, b) =>
          (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99") ||
          priorityRank[a.priority] - priorityRank[b.priority]
      );
      break;
  }

  return sorted;
}

export type BacklogGroup = {
  key: string;
  label: string;
  /** Category color when grouping by category; null/undefined otherwise. */
  color?: string | null;
  tasks: Task[];
};

const priorityGroupLabel: Record<TaskPriority, string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority"
};

/**
 * Bucket already-filtered/sorted tasks into display groups. Task order within
 * each group is preserved from the input.
 */
export function groupBacklogTasks(
  tasks: Task[],
  groupBy: BacklogGroupBy,
  categories: Category[]
): BacklogGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", tasks }];
  }

  if (groupBy === "priority") {
    return (["high", "medium", "low"] as TaskPriority[])
      .map((priority) => ({
        key: priority,
        label: priorityGroupLabel[priority],
        tasks: tasks.filter((task) => task.priority === priority)
      }))
      .filter((group) => group.tasks.length > 0);
  }

  if (groupBy === "category") {
    const buckets = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = task.category_id ?? "inbox";
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(task);
      } else {
        buckets.set(key, [task]);
      }
    }
    return [...buckets.entries()]
      .map(([key, groupTasks]) => {
        const category = categories.find((item) => item.id === key);
        return {
          key,
          label: category?.name ?? "Inbox",
          color: category?.color ?? null,
          tasks: groupTasks
        };
      })
      .sort((a, b) => {
        // Inbox (uncategorized capture point) first, then alphabetical.
        if (a.key === "inbox") return -1;
        if (b.key === "inbox") return 1;
        return a.label.localeCompare(b.label);
      });
  }

  // groupBy === "date": dated groups ascending, unscheduled last.
  const buckets = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.due_date ?? "unscheduled";
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(task);
    } else {
      buckets.set(key, [task]);
    }
  }
  return [...buckets.entries()]
    .map(([key, groupTasks]) => ({
      key,
      label: key === "unscheduled" ? "No date" : formatDateLabel(key),
      tasks: groupTasks
    }))
    .sort((a, b) => {
      if (a.key === "unscheduled") return 1;
      if (b.key === "unscheduled") return -1;
      return a.key.localeCompare(b.key);
    });
}

/** Days a task has been sitting since capture. */
export function backlogAgeDays(task: Task, now = new Date()): number {
  return Math.max(0, differenceInCalendarDays(now, new Date(task.created_at)));
}

/** Age at which an unscheduled task starts showing an aging hint. */
export const BACKLOG_AGING_DAYS = 7;
/** Age at which an unscheduled task is flagged as stale. */
export const BACKLOG_STALE_DAYS = 30;
