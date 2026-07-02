import { describe, expect, it } from "vitest";
import type { Category, Task } from "../types";
import {
  DEFAULT_BACKLOG_FILTERS,
  backlogAgeDays,
  filterBacklogTasks,
  groupBacklogTasks,
  hasActiveBacklogFilters,
  sortBacklogTasks
} from "./backlogView";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? "task_1",
    title: overrides.title ?? "Task",
    description: null,
    category_id: "inbox",
    status: "todo",
    priority: "medium",
    estimated_minutes: null,
    due_date: null,
    template_id: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    completed_at: null,
    dropped_at: null,
    ...overrides
  };
}

function makeCategory(id: string, name: string, color: string | null = null): Category {
  return {
    id,
    name,
    color,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

describe("filterBacklogTasks", () => {
  const unscheduled = makeTask({ id: "u", title: "Write blog post" });
  const scheduled = makeTask({
    id: "s",
    title: "Ship release",
    due_date: "2026-07-10"
  });

  it("keeps everything with default filters", () => {
    expect(filterBacklogTasks([unscheduled, scheduled], DEFAULT_BACKLOG_FILTERS))
      .toEqual([unscheduled, scheduled]);
  });

  it("scopes to unscheduled backlog tasks", () => {
    expect(
      filterBacklogTasks([unscheduled, scheduled], {
        ...DEFAULT_BACKLOG_FILTERS,
        scope: "backlog"
      })
    ).toEqual([unscheduled]);
  });

  it("scopes to scheduled tasks", () => {
    expect(
      filterBacklogTasks([unscheduled, scheduled], {
        ...DEFAULT_BACKLOG_FILTERS,
        scope: "scheduled"
      })
    ).toEqual([scheduled]);
  });

  it("matches search against title and description, case-insensitively", () => {
    const withDescription = makeTask({
      id: "d",
      title: "Misc",
      description: "Refactor the PARSER module"
    });
    const tasks = [unscheduled, withDescription];
    expect(
      filterBacklogTasks(tasks, { ...DEFAULT_BACKLOG_FILTERS, search: "blog" })
    ).toEqual([unscheduled]);
    expect(
      filterBacklogTasks(tasks, { ...DEFAULT_BACKLOG_FILTERS, search: "parser" })
    ).toEqual([withDescription]);
  });

  it("filters by priority", () => {
    const high = makeTask({ id: "h", priority: "high" });
    expect(
      filterBacklogTasks([unscheduled, high], {
        ...DEFAULT_BACKLOG_FILTERS,
        priority: "high"
      })
    ).toEqual([high]);
  });

  it("treats tasks without a category as inbox when filtering by category", () => {
    const uncategorized = makeTask({ id: "n", category_id: null });
    const work = makeTask({ id: "w", category_id: "work" });
    expect(
      filterBacklogTasks([uncategorized, work], {
        ...DEFAULT_BACKLOG_FILTERS,
        categoryId: "inbox"
      })
    ).toEqual([uncategorized]);
  });
});

describe("hasActiveBacklogFilters", () => {
  it("ignores scope; reports search/category/priority", () => {
    expect(hasActiveBacklogFilters(DEFAULT_BACKLOG_FILTERS)).toBe(false);
    expect(
      hasActiveBacklogFilters({ ...DEFAULT_BACKLOG_FILTERS, scope: "backlog" })
    ).toBe(false);
    expect(
      hasActiveBacklogFilters({ ...DEFAULT_BACKLOG_FILTERS, search: " x " })
    ).toBe(true);
    expect(
      hasActiveBacklogFilters({ ...DEFAULT_BACKLOG_FILTERS, priority: "low" })
    ).toBe(true);
  });
});

describe("sortBacklogTasks", () => {
  const oldLow = makeTask({
    id: "old-low",
    priority: "low",
    created_at: "2026-05-01T00:00:00.000Z",
    estimated_minutes: 15
  });
  const newHigh = makeTask({
    id: "new-high",
    priority: "high",
    created_at: "2026-06-20T00:00:00.000Z",
    estimated_minutes: 120
  });
  const midMedium = makeTask({
    id: "mid-medium",
    priority: "medium",
    created_at: "2026-06-10T00:00:00.000Z"
  });

  it("does not mutate the input array", () => {
    const input = [oldLow, newHigh];
    sortBacklogTasks(input, "priority");
    expect(input).toEqual([oldLow, newHigh]);
  });

  it("sorts by priority, newest first within a tier", () => {
    const other = makeTask({
      id: "high-older",
      priority: "high",
      created_at: "2026-06-01T00:00:00.000Z"
    });
    expect(
      sortBacklogTasks([oldLow, other, newHigh], "priority").map((t) => t.id)
    ).toEqual(["new-high", "high-older", "old-low"]);
  });

  it("sorts by created_at for newest/oldest", () => {
    expect(
      sortBacklogTasks([midMedium, newHigh, oldLow], "newest").map((t) => t.id)
    ).toEqual(["new-high", "mid-medium", "old-low"]);
    expect(
      sortBacklogTasks([midMedium, newHigh, oldLow], "oldest").map((t) => t.id)
    ).toEqual(["old-low", "mid-medium", "new-high"]);
  });

  it("sorts shortest estimate first, tasks without estimate last", () => {
    expect(
      sortBacklogTasks([midMedium, newHigh, oldLow], "shortest").map((t) => t.id)
    ).toEqual(["old-low", "new-high", "mid-medium"]);
  });

  it("sorts by due date ascending with unscheduled tasks last", () => {
    const early = makeTask({ id: "early", due_date: "2026-07-05" });
    const late = makeTask({ id: "late", due_date: "2026-07-20" });
    const none = makeTask({ id: "none", due_date: null });
    expect(
      sortBacklogTasks([late, none, early], "date").map((t) => t.id)
    ).toEqual(["early", "late", "none"]);
  });
});

describe("groupBacklogTasks", () => {
  const categories = [
    makeCategory("inbox", "Inbox"),
    makeCategory("work", "Work", "#3aa0ff"),
    makeCategory("art", "Art", "#ff5577")
  ];

  it("returns a single unlabeled group for groupBy none", () => {
    const tasks = [makeTask({ id: "a" })];
    expect(groupBacklogTasks(tasks, "none", categories)).toEqual([
      { key: "all", label: "", tasks }
    ]);
  });

  it("groups by priority in high→low order, dropping empty tiers", () => {
    const high = makeTask({ id: "h", priority: "high" });
    const low = makeTask({ id: "l", priority: "low" });
    const groups = groupBacklogTasks([low, high], "priority", categories);
    expect(groups.map((g) => g.key)).toEqual(["high", "low"]);
    expect(groups[0].tasks).toEqual([high]);
  });

  it("groups by category with inbox first, then alphabetical, carrying color", () => {
    const work = makeTask({ id: "w", category_id: "work" });
    const art = makeTask({ id: "a", category_id: "art" });
    const inbox = makeTask({ id: "i", category_id: null });
    const groups = groupBacklogTasks([work, art, inbox], "category", categories);
    expect(groups.map((g) => g.label)).toEqual(["Inbox", "Art", "Work"]);
    expect(groups[2].color).toBe("#3aa0ff");
  });

  it("labels unknown category ids as Inbox", () => {
    const orphan = makeTask({ id: "o", category_id: "deleted" });
    const groups = groupBacklogTasks([orphan], "category", categories);
    expect(groups[0].label).toBe("Inbox");
  });

  it("groups by date ascending with unscheduled last", () => {
    const early = makeTask({ id: "e", due_date: "2026-07-05" });
    const late = makeTask({ id: "l", due_date: "2026-07-20" });
    const none = makeTask({ id: "n", due_date: null });
    const groups = groupBacklogTasks([late, none, early], "date", categories);
    expect(groups.map((g) => g.key)).toEqual([
      "2026-07-05",
      "2026-07-20",
      "unscheduled"
    ]);
    expect(groups[2].label).toBe("No date");
  });
});

describe("backlogAgeDays", () => {
  it("counts calendar days since capture and never goes negative", () => {
    const task = makeTask({ created_at: "2026-06-01T12:00:00.000Z" });
    expect(backlogAgeDays(task, new Date("2026-06-11T08:00:00.000Z"))).toBe(10);
    expect(backlogAgeDays(task, new Date("2026-05-01T00:00:00.000Z"))).toBe(0);
  });
});
