import { describe, expect, it } from "vitest";
import { executeLookup, toolCatalog, type ToolDeps } from "./tools";
import type { Task } from "../../../types";
import type { RetrospectiveInsights } from "../../retrospect/types";

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    id: partial.id,
    title: partial.title,
    description: partial.description ?? null,
    category_id: partial.category_id ?? null,
    status: partial.status ?? "todo",
    priority: partial.priority ?? "medium",
    estimated_minutes: partial.estimated_minutes ?? null,
    due_date: partial.due_date ?? null,
    template_id: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    completed_at: null,
    dropped_at: null
  };
}

const insights: RetrospectiveInsights = {
  windowDays: 30,
  hasData: true,
  calibration: {
    overall: { scope: "overall", estimatedMinutes: 100, actualMinutes: 130, ratio: 1.3, sampleSize: 8, confidence: "ok" },
    byCategory: [
      { scope: "Design", estimatedMinutes: 60, actualMinutes: 120, ratio: 2.0, sampleSize: 4, confidence: "ok" }
    ]
  },
  slips: { items: [], moreCount: 0, blockerThemes: [] },
  weekly: { thisWeekMinutes: 0, lastWeekMinutes: 0, deltaMinutes: 0, categoryDeltas: [], completedCount: 0, droppedCount: 0 }
};

const deps: ToolDeps = {
  allTasks: [
    task({ id: "t1", title: "Write quarterly report", description: "finance summary" }),
    task({ id: "t2", title: "Book dentist", status: "done" })
  ],
  insights
};

describe("executeLookup", () => {
  it("search_tasks returns id-bearing matches on a keyword", () => {
    const out = executeLookup({ tool: "search_tasks", query: "report" }, deps);
    expect(out).toContain("t1");
    expect(out).toContain("Write quarterly report");
    expect(out).not.toContain("t2");
  });

  it("search_tasks reports no matches without throwing", () => {
    const out = executeLookup({ tool: "search_tasks", query: "zzzznotfound" }, deps);
    expect(out.toLowerCase()).toContain("no matching");
  });

  it("get_calibration returns the per-category ratio without recomputing", () => {
    const out = executeLookup({ tool: "get_calibration", category: "Design" }, deps);
    expect(out).toContain("2");
    expect(out).toContain("Design");
  });

  it("get_calibration falls back to overall when category is unknown", () => {
    const out = executeLookup({ tool: "get_calibration", category: "Nonexistent" }, deps);
    expect(out).toContain("overall");
  });

  it("returns an error string for an unknown tool instead of throwing", () => {
    const out = executeLookup({ tool: "explode_sun" } as never, deps);
    expect(out.toLowerCase()).toContain("unknown tool");
  });

  it("toolCatalog lists every tool name", () => {
    const cat = toolCatalog();
    expect(cat).toContain("search_tasks");
    expect(cat).toContain("get_calibration");
  });
});
