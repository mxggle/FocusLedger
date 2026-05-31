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
};

export type UpdateTaskInput = Partial<
  Pick<Task, "title" | "description" | "category_id" | "priority" | "estimated_minutes" | "due_date" | "status">
>;
