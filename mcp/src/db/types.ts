/**
 * Row shapes as stored in `yolo.db`. These mirror the desktop app's schema
 * (snake_case columns). The MCP server only reads these tables.
 */

export type TaskStatus = "todo" | "doing" | "paused" | "done" | "dropped";
export type TaskPriority = "low" | "medium" | "high";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  estimated_minutes: number | null;
  due_date: string | null;
  template_id: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  dropped_at: string | null;
}

export interface TimeEntryRow {
  id: string;
  task_id: string;
  start_at: string;
  end_at: string | null;
  duration_seconds: number | null;
  note: string | null;
  blocker: string | null;
  next_action: string | null;
  completion_rate: number | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryWithTaskRow extends TimeEntryRow {
  task_title: string;
  task_estimated_minutes: number | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}
