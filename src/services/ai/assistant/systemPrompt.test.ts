import { describe, expect, it } from "vitest";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import type { AssistantContext } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";

const ctx: AssistantContext = {
  today: "2026-06-18",
  categories: [{ id: "c1", name: "Deep Work" }],
  tasks: [
    { id: "t1", title: "Write report", status: "todo", priority: "high", estimatedMinutes: 60, categoryId: "c1" }
  ],
  backlog: []
};

describe("buildAssistantSystemPrompt", () => {
  it("includes persona, JSON contract, every action name, and the context", () => {
    const prompt = buildAssistantSystemPrompt(ctx);
    expect(prompt).toContain("Yolo");
    expect(prompt).toContain('"reply"');
    expect(prompt).toContain('"actions"');
    expect(prompt).toContain("create_task");
    expect(prompt).toContain("reschedule_task");
    expect(prompt).toContain("Write report");
    expect(prompt).toContain("2026-06-18");
    expect(prompt).toContain("t1");
  });

  it("notes when there are no tasks", () => {
    const prompt = buildAssistantSystemPrompt({ ...ctx, tasks: [] });
    expect(prompt.toLowerCase()).toContain("no tasks");
  });
});

const retroBase: AssistantContext = {
  today: "2026-06-19",
  categories: [],
  tasks: [],
  backlog: []
};

const retroInsights: RetrospectiveInsights = {
  windowDays: 30,
  hasData: true,
  calibration: {
    overall: { scope: "overall", estimatedMinutes: 60, actualMinutes: 90, ratio: 1.5, sampleSize: 6, confidence: "ok" },
    byCategory: [
      { scope: "Deep Work", estimatedMinutes: 60, actualMinutes: 90, ratio: 1.5, sampleSize: 6, confidence: "ok" }
    ]
  },
  slips: {
    items: [{ taskId: "a", title: "Pay invoice", kind: "overdue", ageDays: 9 }],
    moreCount: 2,
    blockerThemes: [{ keyword: "design", count: 3 }]
  },
  weekly: {
    thisWeekMinutes: 600,
    lastWeekMinutes: 480,
    deltaMinutes: 120,
    categoryDeltas: [{ category: "Deep Work", thisWeekMinutes: 300, lastWeekMinutes: 180, deltaMinutes: 120 }],
    completedCount: 7,
    droppedCount: 1
  }
};

describe("buildAssistantSystemPrompt — retrospective", () => {
  it("omits the history section when there is no retro", () => {
    expect(buildAssistantSystemPrompt(retroBase)).not.toContain("History & patterns");
  });

  it("includes calibration facts and the honesty/calibration rules", () => {
    const prompt = buildAssistantSystemPrompt({ ...retroBase, retro: retroInsights });
    expect(prompt).toContain("History & patterns");
    expect(prompt).toContain("Deep Work");
    expect(prompt).toContain("1.5");
    expect(prompt).toContain("Pay invoice");
    expect(prompt.toLowerCase()).toContain("calibrat");
  });

  it("flags low-confidence calibration so the model hedges", () => {
    const low: RetrospectiveInsights = {
      ...retroInsights,
      calibration: {
        overall: { scope: "overall", estimatedMinutes: 30, actualMinutes: 30, ratio: 1, sampleSize: 2, confidence: "low" },
        byCategory: []
      }
    };
    expect(buildAssistantSystemPrompt({ ...retroBase, retro: low })).toContain("low confidence");
  });

  it("omits the weekly line when there is no logged time", () => {
    const noTime: RetrospectiveInsights = {
      ...retroInsights,
      weekly: {
        thisWeekMinutes: 0,
        lastWeekMinutes: 0,
        deltaMinutes: 0,
        categoryDeltas: [],
        completedCount: 0,
        droppedCount: 0
      }
    };
    const prompt = buildAssistantSystemPrompt({ ...retroBase, retro: noTime });
    expect(prompt).toContain("History & patterns"); // still rendered (slips present)
    expect(prompt).not.toContain("This week vs last week");
  });
});

describe("buildAssistantSystemPrompt — agent loop", () => {
  const ctxTools: AssistantContext = {
    today: "2026-06-20",
    categories: [],
    tasks: [],
    backlog: [],
    allTasksCount: 12
  };

  it("documents the lookup protocol and read tools", () => {
    const prompt = buildAssistantSystemPrompt(ctxTools);
    expect(prompt).toContain("lookups");
    expect(prompt).toContain("search_tasks");
    expect(prompt).toContain("get_calibration");
  });

  it("instructs dedup before creating tasks", () => {
    const prompt = buildAssistantSystemPrompt(ctxTools);
    expect(prompt.toLowerCase()).toContain("duplicate");
  });

  it("mentions the searchable task count when tasks exist", () => {
    expect(buildAssistantSystemPrompt(ctxTools)).toContain("12");
  });
});

describe("buildAssistantSystemPrompt — user profile", () => {
  const base: AssistantContext = { today: "2026-06-20", categories: [], tasks: [], backlog: [] };

  it("renders the About-the-user section when a profile is present", () => {
    const prompt = buildAssistantSystemPrompt({ ...base, profile: "I'm a PM relocating to Tokyo." });
    expect(prompt).toContain("About the user");
    expect(prompt).toContain("relocating to Tokyo");
  });

  it("omits the section when there is no profile", () => {
    expect(buildAssistantSystemPrompt(base)).not.toContain("About the user");
  });
});
