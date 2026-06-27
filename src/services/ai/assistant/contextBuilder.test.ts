import { describe, expect, it } from "vitest";
import { buildAssistantContext, type AssistantStoreSnapshot } from "./contextBuilder";
import type { Category, Task } from "../../../types";
import type { RetrospectiveInsights } from "../../retrospect/types";
import type { MemoryEntry } from "./memory/types";

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
  categories: [cat],
  allTasks: [task({}), task({ id: "b1", title: "Backlog item", due_date: null })]
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
  categories: [],
  allTasks: []
};

describe("buildAssistantContext", () => {
  it("maps today's tasks and categories", () => {
    const ctx = buildAssistantContext(snapshot);
    expect(ctx.today).toBe("2026-06-18");
    expect(ctx.categories).toEqual([{ id: "c1", name: "Deep Work" }]);
    expect(ctx.tasks[0]).toMatchObject({ id: "t1", title: "Write report", estimatedMinutes: 60 });
  });

  it("passes planned start/end times through to context tasks", () => {
    const ctx = buildAssistantContext({
      ...snapshot,
      tasks: [task({ planned_start_time: "09:00", planned_end_time: "10:00" })]
    });
    expect(ctx.tasks[0]).toMatchObject({ plannedStartTime: "09:00", plannedEndTime: "10:00" });
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

  it("exposes allTasksCount from the snapshot", () => {
    expect(buildAssistantContext(snapshot).allTasksCount).toBe(2);
    expect(buildAssistantContext(snapshotRetro).allTasksCount).toBe(0);
  });

  it("attaches a day briefing computed from today's tasks and target", () => {
    const ctx = buildAssistantContext({
      ...snapshot,
      tasks: [task({ estimated_minutes: 300, status: "todo" })],
      targetMinutes: 240
    });
    expect(ctx.briefing?.scheduledMinutes).toBe(300);
    expect(ctx.briefing?.status).toBe("overcommitted");
    expect(ctx.briefing?.overcommitMinutes).toBe(60);
  });

  it("passes through a non-empty profile (trimmed) and omits a blank one", () => {
    expect(buildAssistantContext({ ...snapshot, profile: "  I'm a PM in Tokyo. " }).profile).toBe(
      "I'm a PM in Tokyo."
    );
    expect(buildAssistantContext({ ...snapshot, profile: "   " }).profile).toBeUndefined();
    expect(buildAssistantContext(snapshot).profile).toBeUndefined();
  });

  it("AI-CTX-08: passes learned memories through when present and omits when empty", () => {
    const memories: MemoryEntry[] = [
      {
        id: "m1",
        kind: "preference",
        text: "Admin on Fridays",
        pinned: false,
        status: "active",
        sourceMessageId: null,
        useCount: 0,
        lastUsedAt: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z"
      }
    ];
    expect(buildAssistantContext({ ...snapshot, learnedMemories: memories }).learnedMemories).toBe(memories);
    expect(buildAssistantContext({ ...snapshot, learnedMemories: [] }).learnedMemories).toBeUndefined();
    expect(buildAssistantContext(snapshot).learnedMemories).toBeUndefined();
  });

  it("threads assistantName, assistantSoul, and an all-task index", () => {
    const ctx = buildAssistantContext({
      selectedDate: "2026-06-20",
      tasks: [],
      backlogTasks: [],
      categories: [],
      allTasks: [
        { id: "t1", title: "Far-future task", status: "todo", priority: "low",
          estimated_minutes: null, category_id: null, description: null, due_date: "2026-09-01",
          template_id: null, planned_start_time: null, planned_end_time: null, sort_order: null,
          created_at: "", updated_at: "", completed_at: null, dropped_at: null }
      ],
      assistantName: "Hermes",
      assistantSoul: "## Identity\nI am Hermes."
    });
    expect(ctx.assistantName).toBe("Hermes");
    expect(ctx.assistantSoul).toContain("I am Hermes.");
    expect(ctx.allTaskRefs).toEqual([{ id: "t1", title: "Far-future task" }]);
  });
});
