import type { TaskPriority } from "./task";

export type RecurrenceType = "daily" | "weekdays" | "weekly";

export type TaskTemplate = {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  priority: TaskPriority;
  estimated_minutes: number | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  recurrence_type: RecurrenceType;
  recurrence_days: number[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateTaskTemplateInput = {
  title: string;
  description?: string | null;
  category_id?: string | null;
  priority?: TaskPriority;
  estimated_minutes?: number | null;
  planned_start_time?: string | null;
  planned_end_time?: string | null;
  recurrence_type: RecurrenceType;
  recurrence_days?: number[];
  enabled?: boolean;
};

export type UpdateTaskTemplateInput = Partial<CreateTaskTemplateInput>;

export type TemplateOccurrence = {
  id: string;
  template_id: string;
  date: string;
  task_id: string | null;
  skipped_at: string | null;
  created_at: string;
  updated_at: string;
};
