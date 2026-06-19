import { describe, expect, it, vi } from "vitest";
import type { Task, TimeEntryWithTask } from "../../types";
import { buildRetrospectiveInsights } from "./index";
import * as loader from "./loadHistory";

const NOW = new Date("2026-06-19T12:00:00.000Z");

function entry(startAt: string, over: Partial<TimeEntryWithTask> = {}): TimeEntryWithTask {
  return {
    id: "e",
    task_id: "t1",
    start_at: startAt,
    end_at: startAt,
    duration_seconds: 3600,
    note: null,
    blocker: null,
    next_action: null,
    completion_rate: null,
    created_at: startAt,
    updated_at: startAt,
    task_title: "Task",
    task_estimated_minutes: 60,
    category_id: "c1",
    category_name: "Deep Work",
    category_color: "#000",
    ...over
  };
}

describe("buildRetrospectiveInsights", () => {
  it("reports hasData=false when there is no history", async () => {
    vi.spyOn(loader, "loadRetrospectiveData").mockResolvedValue({ entries: [], tasks: [] });
    const insights = await buildRetrospectiveInsights(NOW);
    expect(insights.hasData).toBe(false);
    expect(insights.windowDays).toBe(30);
  });

  it("partitions entries into this-week and last-week buckets", async () => {
    const tasks: Task[] = [];
    vi.spyOn(loader, "loadRetrospectiveData").mockResolvedValue({
      entries: [
        entry("2026-06-18T09:00:00.000Z", { duration_seconds: 3600 }),
        entry("2026-06-10T09:00:00.000Z", { duration_seconds: 1800 })
      ],
      tasks
    });
    const insights = await buildRetrospectiveInsights(NOW);
    expect(insights.hasData).toBe(true);
    expect(insights.weekly.thisWeekMinutes).toBe(60);
    expect(insights.weekly.lastWeekMinutes).toBe(30);
  });
});
