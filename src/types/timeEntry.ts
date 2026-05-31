export type TimeEntry = {
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
};

export type TimeEntryWithTask = TimeEntry & {
  task_title: string;
  task_estimated_minutes: number | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
};

export type StopSessionInput = {
  note?: string | null;
  blocker?: string | null;
  next_action?: string | null;
  completion_rate?: number | null;
};
