import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../../../types";
import { dailySummaryTool } from "./dailySummary";
import { getCalibrationTool } from "./getCalibration";
import { getTaskTool } from "./getTask";
import { listCategoriesTool } from "./listCategories";
import { listTasksTool } from "./listTasks";
import { recallTool } from "./recall";
import { searchTasksTool } from "./searchTasks";
import type { AgentToolDeps } from "./types";

function task(p: Partial<Task> & { id: string; title?: string }): Task {
  return {
    id: p.id,
    title: p.title ?? "Report",
    description: p.description ?? null,
    category_id: p.category_id ?? null,
    status: p.status ?? "todo",
    priority: p.priority ?? "medium",
    estimated_minutes: p.estimated_minutes ?? null,
    due_date: p.due_date === undefined ? "2026-06-23" : p.due_date,
    template_id: null,
    planned_start_time: p.planned_start_time ?? null,
    planned_end_time: p.planned_end_time ?? null,
    sort_order: null,
    created_at: "x",
    updated_at: p.updated_at ?? "u0",
    completed_at: null,
    dropped_at: null
  };
}

function deps(
  tasks: Task[],
  opts: { insights?: unknown; history?: unknown; categories?: { id: string; name: string }[]; ctx?: Record<string, unknown> } = {}
): AgentToolDeps {
  const categories = opts.categories ?? [{ id: "c1", name: "Dev" }];
  return {
    store: {
      getAllTasks: () => tasks,
      getCategories: () => categories,
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      startTask: vi.fn(),
      pauseActiveTask: vi.fn(),
      completeTask: vi.fn(),
      dropTask: vi.fn(),
      moveTaskToBacklog: vi.fn(),
      ensureCategory: vi.fn(),
      refresh: vi.fn()
    } as never,
    ctx: {
      today: "2026-06-23",
      tasks: [],
      backlog: [],
      categories,
      assistantName: "Yolo",
      assistantSoul: "",
      allTaskRefs: [],
      ...opts.ctx
    } as never,
    insights: (opts.insights ?? null) as never,
    history: (opts.history ?? []) as never,
    now: () => "2026-06-23T00:00:00.000Z"
  };
}

describe("read tools", () => {
  it("list_tasks renders schedule times and filters by scope/status", async () => {
    const today = task({
      id: "t1",
      title: "Write report",
      category_id: "c1",
      due_date: "2026-06-23",
      planned_start_time: "09:00",
      planned_end_time: "10:00",
      estimated_minutes: 60
    });
    const done = task({ id: "t2", title: "Done", due_date: "2026-06-23", status: "done" });
    const backlog = task({ id: "t3", title: "Later", due_date: null });
    const res = await listTasksTool.execute({ scope: "today", status: "todo" }, deps([today, done, backlog]));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary).toContain('[t1] "Write report"');
      expect(res.summary).toContain("09:00-10:00");
      expect(res.summary).toContain("due 2026-06-23");
      expect(res.summary).not.toContain("[t2]");
      expect(res.summary).not.toContain("[t3]");
    }
  });

  it("search_tasks returns keyword matches", async () => {
    const res = await searchTasksTool.execute(
      { query: "launch" },
      deps([
        task({ id: "t1", title: "Launch checklist", description: "Ship the beta" }),
        task({ id: "t2", title: "Read book" })
      ])
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary).toContain('[t1] "Launch checklist"');
      expect(res.summary).not.toContain("[t2]");
    }
  });

  it("list_tasks covers backlog, all, category, and undated filters (AI-TOOL-01)", async () => {
    const today = task({
      id: "t1",
      title: "Write report",
      category_id: "c1",
      due_date: "2026-06-23",
      planned_start_time: "09:00",
      planned_end_time: "10:00"
    });
    const uncategorized = task({ id: "t2", title: "Misc", due_date: "2026-06-23" });
    const backlog = task({ id: "t3", title: "Later", due_date: null });

    const backlogRes = await listTasksTool.execute({ scope: "backlog" }, deps([today, uncategorized, backlog]));
    expect(backlogRes.ok).toBe(true);
    if (backlogRes.ok) expect(backlogRes.summary).toContain("[t3]");

    const allRes = await listTasksTool.execute({ scope: "all" }, deps([today, uncategorized, backlog]));
    expect(allRes.ok).toBe(true);
    if (allRes.ok) {
      expect(allRes.summary).toContain("[t1]");
      expect(allRes.summary).toContain("[t3]");
    }

    const catRes = await listTasksTool.execute(
      { scope: "all", category: "Dev" },
      deps([today, uncategorized, backlog])
    );
    expect(catRes.ok).toBe(true);
    if (catRes.ok) {
      expect(catRes.summary).toContain("[t1]");
      expect(catRes.summary).not.toContain("[t2]");
    }

    const noneRes = await listTasksTool.execute(
      { scope: "all", category: "none" },
      deps([today, uncategorized, backlog])
    );
    expect(noneRes.ok).toBe(true);
    if (noneRes.ok) {
      expect(noneRes.summary).toContain("[t2]");
      expect(noneRes.summary).not.toContain("[t1]");
    }

    const undatedRes = await listTasksTool.execute(
      { scope: "all", undated: true },
      deps([today, uncategorized, backlog])
    );
    expect(undatedRes.ok).toBe(true);
    if (undatedRes.ok) {
      expect(undatedRes.summary).toContain("[t3]");
      expect(undatedRes.summary).not.toContain("[t1]");
    }
  });

  it("list_tasks can filter an explicit due date including yesterday", async () => {
    const today = task({ id: "t1", title: "Today", due_date: "2026-06-23" });
    const yesterday = task({ id: "t2", title: "Yesterday", due_date: "2026-06-22" });
    const older = task({ id: "t3", title: "Older", due_date: "2026-06-21" });

    const relative = await listTasksTool.execute({ due_date: "yesterday" }, deps([today, yesterday, older]));
    expect(relative.ok).toBe(true);
    if (relative.ok) {
      expect(relative.summary).toContain('[t2] "Yesterday"');
      expect(relative.summary).not.toContain("[t1]");
      expect(relative.summary).not.toContain("[t3]");
      expect(relative.data).toEqual([yesterday]);
    }

    const explicit = await listTasksTool.execute({ due_date: "2026-06-21" }, deps([today, yesterday, older]));
    expect(explicit.ok).toBe(true);
    if (explicit.ok) {
      expect(explicit.summary).toContain('[t3] "Older"');
      expect(explicit.data).toEqual([older]);
    }
  });

  it("search_tasks caps results and reports no-match (AI-TOOL-03)", async () => {
    const many = Array.from({ length: 12 }, (_, i) => task({ id: `t${i}`, title: `Launch ${i}` }));
    const capped = await searchTasksTool.execute({ query: "launch" }, deps(many));
    expect(capped.ok).toBe(true);
    if (capped.ok) {
      expect(capped.data).toHaveLength(8);
      expect(capped.summary).toContain("found 8");
    }

    const none = await searchTasksTool.execute({ query: "zzz" }, deps(many));
    expect(none.ok).toBe(true);
    if (none.ok) {
      expect(none.summary).toContain("no matching tasks");
      expect(none.data).toEqual([]);
    }
  });
});

describe("get_task", () => {
  it("returns a full line for a known id and a controlled error for unknown (AI-TOOL-02)", async () => {
    const known = await getTaskTool.execute(
      { task_id: "t1" },
      deps([task({ id: "t1", title: "Write report", planned_start_time: "09:00", planned_end_time: "10:00" })])
    );
    expect(known.ok).toBe(true);
    if (known.ok) {
      expect(known.summary).toContain('[t1] "Write report"');
      expect(known.summary).toContain("09:00-10:00");
    }

    const unknown = await getTaskTool.execute({ task_id: "ghost" }, deps([task({ id: "t1" })]));
    expect(unknown.ok).toBe(false);
  });
});

describe("list_categories", () => {
  it("lists non-empty and empty category sets (AI-TOOL-04)", async () => {
    const res = await listCategoriesTool.execute({}, deps([], { categories: [{ id: "c1", name: "Dev" }, { id: "c2", name: "Study" }] }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary).toContain("Dev [c1]");
      expect(res.summary).toContain("Study [c2]");
    }

    const empty = await listCategoriesTool.execute({}, deps([], { categories: [] }));
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.summary).toContain("no categories");
  });
});

describe("get_calibration", () => {
  const overall = { scope: "overall", estimatedMinutes: 200, actualMinutes: 150, ratio: 0.75, sampleSize: 5, confidence: "ok" };
  const dev = { scope: "Dev", estimatedMinutes: 100, actualMinutes: 80, ratio: 0.8, sampleSize: 3, confidence: "ok" };
  const low = { scope: "Writing", estimatedMinutes: 50, actualMinutes: 20, ratio: 0.4, sampleSize: 1, confidence: "low" };
  const insights = { calibration: { overall, byCategory: [dev, low] } };

  it("reports overall ratio and category-specific ratio (AI-TOOL-05)", async () => {
    const overallRes = await getCalibrationTool.execute({}, deps([], { insights }));
    expect(overallRes.ok).toBe(true);
    if (overallRes.ok) expect(overallRes.summary).toContain("75%");

    const catRes = await getCalibrationTool.execute({ category: "Dev" }, deps([], { insights }));
    expect(catRes.ok).toBe(true);
    if (catRes.ok) expect(catRes.summary).toContain("80%");
  });

  it("flags low confidence and degrades with no history (AI-TOOL-05)", async () => {
    const lowRes = await getCalibrationTool.execute({ category: "Writing" }, deps([], { insights }));
    expect(lowRes.ok).toBe(true);
    if (lowRes.ok) expect(lowRes.summary).toContain("low confidence");

    const none = await getCalibrationTool.execute({}, deps([]));
    expect(none.ok).toBe(true);
    if (none.ok) expect(none.summary).toContain("no estimate history yet");
  });
});

describe("recall", () => {
  it("matches keywords with date/note grounding and handles no history (AI-TOOL-06)", async () => {
    const history = [
      { date: "2026-06-20", taskTitle: "Japanese practice", category: "Study", note: "slipped again", blocker: "tired", nextAction: "try morning block" }
    ];
    const res = await recallTool.execute({ query: "japanese" }, deps([], { history }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary).toContain("2026-06-20");
      expect(res.summary).toContain("Japanese practice");
      expect(res.summary).toContain("slipped again");
    }

    const none = await recallTool.execute({ query: "anything" }, deps([]));
    expect(none.ok).toBe(true);
    if (none.ok) expect(none.summary).toContain("no logged reflections yet");
  });
});

describe("daily_summary", () => {
  const briefing = {
    scheduledMinutes: 120,
    targetMinutes: 240,
    overcommitMinutes: 0,
    openCount: 2,
    doneCount: 1,
    backlogCount: 3,
    status: "light"
  };

  it("summarizes today and an explicit date scope (AI-TOOL-07)", async () => {
    const today = await dailySummaryTool.execute({ scope: "today" }, deps([], { ctx: { briefing } }));
    expect(today.ok).toBe(true);
    if (today.ok) {
      expect(today.summary).toContain("daily_summary(today)");
      expect(today.summary).toContain("light");
    }

    const date = await dailySummaryTool.execute({ scope: "2026-06-24" }, deps([], { ctx: { briefing } }));
    expect(date.ok).toBe(true);
    if (date.ok) expect(date.summary).toContain("daily_summary(2026-06-24)");
  });

  it("rejects an invalid scope (AI-TOOL-07)", async () => {
    const res = await dailySummaryTool.execute({ scope: "this week" }, deps([]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('scope must be "today" or YYYY-MM-DD');
  });
});
