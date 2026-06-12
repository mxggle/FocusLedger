import { describe, expect, it } from "vitest";
import type { Task, TimeEntryWithTask, TodayStats } from "../../types";
import { buildDebriefPrompt } from "./debriefService";

const task: Task = {
  id: "task-1",
  title: "Write report",
  description: null,
  category_id: "dev",
  status: "done",
  priority: "high",
  estimated_minutes: 60,
  due_date: "2026-06-13",
  template_id: null,
  planned_start_time: null,
  planned_end_time: null,
  sort_order: null,
  created_at: "2026-06-13T08:00:00.000Z",
  updated_at: "2026-06-13T10:00:00.000Z",
  completed_at: "2026-06-13T10:00:00.000Z",
  dropped_at: null
};

const entry: TimeEntryWithTask = {
  id: "entry-1",
  task_id: "task-1",
  start_at: "2026-06-13T09:00:00.000Z",
  end_at: "2026-06-13T10:30:00.000Z",
  duration_seconds: 5400,
  note: "Drafted the outline",
  blocker: "Missing Q2 numbers",
  next_action: "Chase finance for data",
  completion_rate: 70,
  created_at: "2026-06-13T09:00:00.000Z",
  updated_at: "2026-06-13T10:30:00.000Z",
  task_title: "Write report",
  task_estimated_minutes: 60,
  category_id: "dev",
  category_name: "Development",
  category_color: "#7c3aed"
};

const stats: TodayStats = {
  date: "2026-06-13",
  totalFocusSeconds: 5400,
  completedTaskCount: 1,
  droppedTaskCount: 0,
  estimatedSeconds: 3600,
  actualSeconds: 5400,
  driftSeconds: 1800,
  categoryStats: [
    { categoryId: "dev", categoryName: "Development", color: "#7c3aed", totalSeconds: 5400 }
  ]
};

describe("buildDebriefPrompt", () => {
  it("includes totals, tasks, and session reflections", () => {
    const prompt = buildDebriefPrompt({
      date: "2026-06-13",
      tasks: [task],
      entries: [entry],
      stats
    });

    expect(prompt).toContain("Date: 2026-06-13");
    expect(prompt).toContain("Focused time: 1h 30m");
    expect(prompt).toContain('"Write report" [done, high, est 60m]');
    expect(prompt).toContain("did: Drafted the outline");
    expect(prompt).toContain("blocker: Missing Q2 numbers");
    expect(prompt).toContain("next: Chase finance for data");
    expect(prompt).toContain("felt completion: 70%");
  });

  it("says so when no sessions were recorded", () => {
    const prompt = buildDebriefPrompt({
      date: "2026-06-13",
      tasks: [],
      entries: [],
      stats: null
    });

    expect(prompt).toContain("No focus sessions were recorded today.");
  });

  it("orders sessions chronologically even when given newest-first", () => {
    const earlier: TimeEntryWithTask = {
      ...entry,
      id: "entry-0",
      start_at: "2026-06-13T07:00:00.000Z",
      end_at: "2026-06-13T07:30:00.000Z",
      note: "Morning warmup",
      blocker: null,
      next_action: null,
      completion_rate: null
    };

    const prompt = buildDebriefPrompt({
      date: "2026-06-13",
      tasks: [],
      entries: [entry, earlier],
      stats: null
    });

    expect(prompt.indexOf("Morning warmup")).toBeLessThan(prompt.indexOf("Drafted the outline"));
  });
});
