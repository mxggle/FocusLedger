import { describe, expect, it } from "vitest";
import { validateTaskSchedule, validateTemplateSchedule } from "./scheduleConflictService";
import type { Task, TaskTemplate } from "../types";

const baseTemplate: TaskTemplate = {
  id: "tpl-1",
  title: "Morning focus",
  description: null,
  category_id: "inbox",
  priority: "medium",
  estimated_minutes: 60,
  planned_start_time: "09:00",
  planned_end_time: "10:00",
  recurrence_type: "daily",
  recurrence_days: [],
  enabled: true,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z"
};

const baseTask: Task = {
  id: "task-1",
  title: "Morning focus",
  description: null,
  category_id: "inbox",
  status: "todo",
  priority: "medium",
  estimated_minutes: 60,
  due_date: "2026-06-01",
  template_id: "tpl-1",
  planned_start_time: "09:00",
  planned_end_time: "10:00",
  sort_order: 540,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
  completed_at: null,
  dropped_at: null
};

describe("validateTemplateSchedule", () => {
  it("rejects overlapping recurring templates on shared days", () => {
    const result = validateTemplateSchedule(
      {
        title: "Study",
        planned_start_time: "09:30",
        planned_end_time: "10:30",
        estimated_minutes: null,
        recurrence_type: "weekly",
        recurrence_days: [1]
      },
      [baseTemplate]
    );

    expect(result.ok).toBe(false);
  });

  it("allows adjacent blocks", () => {
    const result = validateTemplateSchedule(
      {
        title: "Study",
        planned_start_time: "10:00",
        planned_end_time: "10:30",
        estimated_minutes: null,
        recurrence_type: "daily",
        recurrence_days: []
      },
      [baseTemplate]
    );

    expect(result.ok).toBe(true);
  });

  it("uses estimate as the block duration when end time is empty", () => {
    const result = validateTemplateSchedule(
      {
        title: "Study",
        planned_start_time: "09:30",
        planned_end_time: null,
        estimated_minutes: 45,
        recurrence_type: "weekdays",
        recurrence_days: []
      },
      [baseTemplate]
    );

    expect(result.ok).toBe(false);
  });

  it("allows disabled templates to keep conflicting times", () => {
    const result = validateTemplateSchedule(
      {
        title: "Study",
        planned_start_time: "09:30",
        planned_end_time: "10:30",
        estimated_minutes: null,
        recurrence_type: "daily",
        recurrence_days: [],
        enabled: false
      },
      [baseTemplate]
    );

    expect(result.ok).toBe(true);
  });
});

describe("validateTaskSchedule", () => {
  it("rejects overlapping planned task instances on the same date", () => {
    const result = validateTaskSchedule(
      {
        ...baseTask,
        id: "task-2",
        title: "Study",
        planned_start_time: "09:15",
        planned_end_time: "09:45"
      },
      [baseTask],
      "task-2"
    );

    expect(result.ok).toBe(false);
  });

  it("ignores completed and dropped tasks when checking today's plan", () => {
    const result = validateTaskSchedule(
      {
        ...baseTask,
        id: "task-2",
        title: "Study",
        planned_start_time: "09:15",
        planned_end_time: "09:45"
      },
      [{ ...baseTask, status: "done" }],
      "task-2"
    );

    expect(result.ok).toBe(true);
  });
});
