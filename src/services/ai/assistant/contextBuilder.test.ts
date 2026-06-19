import { describe, expect, it } from "vitest";
import { buildAssistantContext, type AssistantStoreSnapshot } from "./contextBuilder";
import type { Category, Task } from "../../../types";
import type { RetrospectiveInsights } from "../../retrospect/types";

function task(overrides: Partial<Task>): Task {
  return {
    id: "t1", title: "Write report", description: null, category_id: "c1",
    status: "todo", priority: "high", estimated_minutes: 60, due_date: "2026-06-18",
    template_id: null, planned_start_time: null, planned_end_time: null, sort_order: 0,
    created_at: "", updated_at: "", completed_at: null, dropped_at: null, ...overrides
  };
}
const cat: Category = { id: "c1", name: "Deep Work" } as Category;

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-18",
  tasks: [task({})],
  backlogTasks: [task({ id: "b1", title: "Backlog item", due_date: null })],
  categories: [cat]
};

const retroInsights: RetrospectiveInsights = {
  windowDays: 30,
  hasData: true,
  calibration: { overall: null, byCategory: [] },
  slips: { items: [], moreCount: 0, blockerThemes: [] },
  weekly: {
    thisWeekMinutes: 0,
    lastWeekMinutes: 0,
    deltaMinutes: 0,
    categoryDeltas: [],
    completedCount: 0,
    droppedCount: 0
  }
};

const snapshotRetro: AssistantStoreSnapshot = {
  selectedDate: "2026-06-19",
  tasks: [],
  backlogTasks: [],
  categories: []
};

describe("buildAssistantContext", () => {
  it("maps today's tasks and categories", () => {
    const ctx = buildAssistantContext(snapshot);
    expect(ctx.today).toBe("2026-06-18");
    expect(ctx.categories).toEqual([{ id: "c1", name: "Deep Work" }]);
    expect(ctx.tasks[0]).toMatchObject({ id: "t1", title: "Write report", estimatedMinutes: 60 });
  });

  it("caps backlog to 30 items", () => {
    const big = Array.from({ length: 50 }, (_, i) => task({ id: `b${i}`, due_date: null }));
    const ctx = buildAssistantContext({ ...snapshot, backlogTasks: big });
    expect(ctx.backlog).toHaveLength(30);
  });

  it("omits retro when no insights are passed", () => {
    expect(buildAssistantContext(snapshotRetro).retro).toBeUndefined();
  });

  it("omits retro when insights have no data", () => {
    expect(buildAssistantContext(snapshotRetro, { ...retroInsights, hasData: false }).retro).toBeUndefined();
  });

  it("attaches retro when insights have data", () => {
    expect(buildAssistantContext(snapshotRetro, retroInsights).retro).toBe(retroInsights);
  });
});
