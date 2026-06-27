export type TaskStatus = "todo" | "doing" | "paused" | "done" | "dropped";
export type TaskPriority = "low" | "medium" | "high";

export type Task = {
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
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  category_id?: string | null;
  priority?: TaskPriority;
  estimated_minutes?: number | null;
  due_date?: string | null;
  template_id?: string | null;
  planned_start_time?: string | null;
  planned_end_time?: string | null;
  sort_order?: number | null;
};

export type UpdateTaskInput = Partial<
  Pick<
    Task,
    | "title"
    | "description"
    | "category_id"
    | "priority"
    | "estimated_minutes"
    | "due_date"
    | "status"
    | "template_id"
    | "planned_start_time"
    | "planned_end_time"
    | "sort_order"
    // Lifecycle timestamps travel with status so a status change can keep them
    // consistent (set on done/dropped, cleared otherwise).
    | "completed_at"
    | "dropped_at"
  >
>;
