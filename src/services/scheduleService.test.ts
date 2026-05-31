import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleService, templateAppliesToDate } from "./scheduleService";
import { taskRepository } from "../db/taskRepository";
import { taskTemplateRepository } from "../db/taskTemplateRepository";
import type { Task, TaskTemplate, TemplateOccurrence } from "../types";

vi.mock("../db/taskRepository", () => ({
  taskRepository: {
    createTask: vi.fn(),
    getById: vi.fn(),
    updateTask: vi.fn()
  }
}));

vi.mock("../db/taskTemplateRepository", () => ({
  taskTemplateRepository: {
    createOccurrence: vi.fn(),
    getEnabled: vi.fn(),
    getOccurrence: vi.fn(),
    setOccurrenceTask: vi.fn(),
    skipOccurrence: vi.fn()
  }
}));

const baseTemplate: Pick<TaskTemplate, "recurrence_type" | "recurrence_days"> = {
  recurrence_type: "daily",
  recurrence_days: []
};

describe("templateAppliesToDate", () => {
  it("matches daily templates on every date", () => {
    expect(templateAppliesToDate(baseTemplate, "2026-06-01")).toBe(true);
    expect(templateAppliesToDate(baseTemplate, "2026-06-07")).toBe(true);
  });

  it("matches weekdays from Monday through Friday", () => {
    const template = { ...baseTemplate, recurrence_type: "weekdays" as const };

    expect(templateAppliesToDate(template, "2026-06-01")).toBe(true);
    expect(templateAppliesToDate(template, "2026-06-05")).toBe(true);
    expect(templateAppliesToDate(template, "2026-06-06")).toBe(false);
    expect(templateAppliesToDate(template, "2026-06-07")).toBe(false);
  });

  it("matches explicit weekly days using Monday as 1 and Sunday as 7", () => {
    const template = { ...baseTemplate, recurrence_type: "weekly" as const, recurrence_days: [1, 3, 7] };

    expect(templateAppliesToDate(template, "2026-06-01")).toBe(true);
    expect(templateAppliesToDate(template, "2026-06-02")).toBe(false);
    expect(templateAppliesToDate(template, "2026-06-03")).toBe(true);
    expect(templateAppliesToDate(template, "2026-06-07")).toBe(true);
  });
});

const template: TaskTemplate = {
  id: "tpl_focus",
  title: "Focus block",
  description: null,
  category_id: "development",
  priority: "medium",
  estimated_minutes: 45,
  planned_start_time: "09:00",
  planned_end_time: "09:45",
  recurrence_type: "daily",
  recurrence_days: [],
  enabled: true,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z"
};

const task: Task = {
  id: "task_focus",
  title: "Focus block",
  description: null,
  category_id: "development",
  status: "todo",
  priority: "medium",
  estimated_minutes: 45,
  due_date: "2026-06-01",
  template_id: "tpl_focus",
  planned_start_time: "09:00",
  planned_end_time: "09:45",
  sort_order: 540,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
  completed_at: null,
  dropped_at: null
};

const skippedOccurrence: TemplateOccurrence = {
  id: "occ_focus",
  template_id: "tpl_focus",
  date: "2026-06-01",
  task_id: "task_focus",
  skipped_at: "2026-06-01T08:00:00.000Z",
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T08:00:00.000Z"
};

describe("scheduleService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a generated task dropped and skips the matching occurrence", async () => {
    vi.mocked(taskRepository.getById).mockResolvedValue(task);
    vi.mocked(taskRepository.updateTask).mockResolvedValue({
      ...task,
      status: "dropped",
      dropped_at: "2026-06-01T08:00:00.000Z",
      updated_at: "2026-06-01T08:00:00.000Z"
    });
    vi.mocked(taskTemplateRepository.skipOccurrence).mockResolvedValue(skippedOccurrence);

    await scheduleService.skipOccurrenceForTask(task.id);

    expect(taskRepository.updateTask).toHaveBeenCalledWith(task.id, {
      status: "dropped",
      completed_at: null,
      dropped_at: expect.any(String)
    });
    expect(taskTemplateRepository.skipOccurrence).toHaveBeenCalledWith("tpl_focus", "2026-06-01", task.id);
  });

  it("does not generate a new task when an occurrence was skipped", async () => {
    vi.mocked(taskTemplateRepository.getEnabled).mockResolvedValue([template]);
    vi.mocked(taskTemplateRepository.getOccurrence).mockResolvedValue(skippedOccurrence);

    await scheduleService.generateTasksForDate("2026-06-01");

    expect(taskRepository.createTask).not.toHaveBeenCalled();
    expect(taskTemplateRepository.setOccurrenceTask).not.toHaveBeenCalled();
  });
});
