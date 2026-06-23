import { describe, expect, it } from "vitest";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import type { AssistantContext } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";

function makeCtx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  return {
    today: "2026-06-20",
    categories: [],
    tasks: [],
    backlog: [],
    assistantName: "Yolo Assistant",
    assistantSoul: "",
    allTaskRefs: [],
    ...overrides
  };
}

const ctx = makeCtx({
  today: "2026-06-18",
  categories: [{ id: "c1", name: "Deep Work" }],
  tasks: [
    {
      id: "t1",
      title: "Write report",
      status: "todo",
      priority: "high",
      estimatedMinutes: 60,
      categoryId: "c1",
      plannedStartTime: null,
      plannedEndTime: null
    }
  ]
});

describe("buildAssistantSystemPrompt", () => {
  it("includes persona, the tool-call contract, key tools, and the context", () => {
    const prompt = buildAssistantSystemPrompt(ctx);
    expect(prompt).toContain("Yolo");
    expect(prompt).toContain("tool_calls");
    expect(prompt).toContain("create_task");
    expect(prompt).toContain("update_task");
    expect(prompt).toContain("Write report");
    expect(prompt).toContain("2026-06-18");
    expect(prompt).toContain("t1");
  });

  it("instructs the model to give final answers as markdown, not legacy action JSON", () => {
    const prompt = buildAssistantSystemPrompt(ctx);
    expect(prompt.toLowerCase()).toContain("markdown");
    expect(prompt).toContain("tool_calls");
    expect(prompt).not.toContain("SINGLE JSON object");
    expect(prompt).not.toContain("fenced ```json");
  });

  it("notes when there are no tasks", () => {
    const prompt = buildAssistantSystemPrompt({ ...ctx, tasks: [] });
    expect(prompt.toLowerCase()).toContain("no tasks");
  });

  it("renders the Soul as slot #1 and drops the hardcoded day-planning identity", () => {
    const prompt = buildAssistantSystemPrompt(makeCtx({ assistantName: "Hermes", assistantSoul: "" }));
    expect(prompt).toContain("operating partner"); // a phrase from DEFAULT_SOUL
    expect(prompt).toContain("Hermes");
    expect(prompt).not.toContain("focused day-planning companion");
  });

  it("uses a custom soul verbatim when provided", () => {
    const prompt = buildAssistantSystemPrompt(makeCtx({ assistantSoul: "## Identity\nI am a pirate." }));
    expect(prompt).toContain("I am a pirate.");
  });

  it("renders planned task times in context", () => {
    const prompt = buildAssistantSystemPrompt(
      makeCtx({
        tasks: [
          {
            id: "t1",
            title: "Write report",
            status: "todo",
            priority: "high",
            estimatedMinutes: 60,
            categoryId: "c1",
            plannedStartTime: "09:00",
            plannedEndTime: "10:00"
          }
        ]
      })
    );
    expect(prompt).toContain("09:00-10:00");
  });
});

const retroBase = makeCtx({ today: "2026-06-19" });

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
  const ctxTools = makeCtx({ allTasksCount: 12 });

  it("documents the tool-call protocol and unified tool catalog", () => {
    const prompt = buildAssistantSystemPrompt(ctxTools);
    expect(prompt).toContain("tool_calls");
    expect(prompt).toContain("search_tasks");
    expect(prompt).toContain("get_calibration");
    expect(prompt).toContain("update_task");
  });

  it("includes the create_task honesty rule and removes brain-dump decomposition framing", () => {
    const prompt = buildAssistantSystemPrompt(ctxTools);
    expect(prompt).toContain("create_task is ONLY for genuinely new work");
    expect(prompt.toLowerCase()).not.toContain("decompose");
  });

  it("documents recall for questions about past work", () => {
    const prompt = buildAssistantSystemPrompt(ctxTools);
    expect(prompt).toContain("recall");
    expect(prompt.toLowerCase()).toContain("lessons learned");
  });

  it("mentions the searchable task count when tasks exist", () => {
    expect(buildAssistantSystemPrompt(ctxTools)).toContain("12");
  });

  it("renders permission framing from the context", () => {
    expect(buildAssistantSystemPrompt({ ...ctxTools, permissionLevel: "plan" })).toContain("Permission: PLAN");
    expect(buildAssistantSystemPrompt({ ...ctxTools, permissionLevel: "ask" })).toContain("Permission: ASK");
    expect(buildAssistantSystemPrompt({ ...ctxTools, permissionLevel: "auto" })).toContain("Permission: AUTO");
  });
});

describe("buildAssistantSystemPrompt — user profile", () => {
  const base = makeCtx();

  it("renders the About-the-user section when a profile is present", () => {
    const prompt = buildAssistantSystemPrompt({ ...base, profile: "I'm a PM relocating to Tokyo." });
    expect(prompt).toContain("About the user");
    expect(prompt).toContain("relocating to Tokyo");
  });

  it("omits the section when there is no profile", () => {
    expect(buildAssistantSystemPrompt(base)).not.toContain("About the user");
  });
});

describe("buildAssistantSystemPrompt — day briefing", () => {
  const withBriefing = makeCtx({
    briefing: {
      scheduledMinutes: 300,
      targetMinutes: 240,
      overcommitMinutes: 60,
      openCount: 4,
      doneCount: 1,
      backlogCount: 7,
      status: "overcommitted"
    }
  });

  it("renders today's load and the proactive rules when a briefing is present", () => {
    const prompt = buildAssistantSystemPrompt(withBriefing);
    expect(prompt).toContain("Today at a glance");
    expect(prompt).toContain("300m scheduled");
    expect(prompt).toContain("overcommitted by 60m");
    expect(prompt.toLowerCase()).toContain("proactive");
  });

  it("omits the briefing section when there is no briefing", () => {
    const prompt = buildAssistantSystemPrompt(makeCtx());
    expect(prompt).not.toContain("Today at a glance");
  });
});

describe("buildAssistantSystemPrompt — learned memory", () => {
  it("includes learned memories when present", () => {
    const prompt = buildAssistantSystemPrompt(
      makeCtx({
        learnedMemories: [
          {
            id: "a",
            kind: "preference",
            text: "Prefers mornings",
            pinned: false,
            status: "active",
            sourceMessageId: null,
            useCount: 0,
            lastUsedAt: null,
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z"
          }
        ]
      })
    );
    expect(prompt).toContain("Prefers mornings");
  });

  it("omits the block when there are no learned memories (byte-identical)", () => {
    expect(buildAssistantSystemPrompt(makeCtx())).not.toContain("learned about the user over time");
  });
});
