import { describe, expect, it, vi } from "vitest";
import { runAssistantToolTurn } from "./assistantRunner";
import type { AssistantStoreSnapshot } from "./contextBuilder";
import type { RetrospectiveInsights } from "../../retrospect/types";
import type { Task } from "../../../types";

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-18",
  tasks: [],
  backlogTasks: [],
  categories: [{ id: "c1", name: "Deep Work" } as never],
  allTasks: []
};

const settings = { aiProvider: "anthropic" as const, aiApiKey: "k", aiModel: "", aiBaseUrl: "" };

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Report",
    description: null,
    status: "todo",
    priority: "medium",
    category_id: null,
    estimated_minutes: null,
    due_date: "2026-06-18",
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    template_id: null,
    created_at: "2026-06-18T09:00:00Z",
    updated_at: "u0",
    completed_at: null,
    dropped_at: null,
    ...overrides
  };
}

function storeWith(tasks: Task[], updateTask = vi.fn(async () => ({ ok: true }))) {
  return {
    getAllTasks: () => tasks,
    getCategories: () => [],
    updateTask,
    createTask: vi.fn(),
    deleteTask: vi.fn(),
    startTask: vi.fn(),
    pauseActiveTask: vi.fn(),
    completeTask: vi.fn(),
    dropTask: vi.fn(),
    moveTaskToBacklog: vi.fn(),
    ensureCategory: vi.fn(),
    refresh: vi.fn()
  };
}

describe("runAssistantToolTurn", () => {
  it("builds the tool prompt and executes reversible writes in auto mode", async () => {
    const tasks = [taskFixture()];
    const updateTask = vi.fn(async () => ({ ok: true }));
    const generateChat = vi
      .fn()
      .mockResolvedValueOnce('{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}')
      .mockResolvedValueOnce("Done.");

    const result = await runAssistantToolTurn(
      {
        settings,
        snapshot: { ...snapshot, allTasks: tasks, tasks, permissionLevel: "auto" },
        messages: [{ role: "user", content: "move report to 9:30" }]
      },
      { generateChat, store: storeWith(tasks, updateTask) }
    );

    expect(generateChat.mock.calls[0][1].system).toContain("tool_calls");
    expect(updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(result.reply).toBe("Done.");
    expect(result.toolCalls[0]).toMatchObject({ name: "update_task", status: "executed" });
  });

  it("uses the snapshot permission level to queue writes in ask mode", async () => {
    const tasks = [taskFixture()];
    const updateTask = vi.fn(async () => ({ ok: true }));
    const generateChat = vi
      .fn()
      .mockResolvedValueOnce('{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}')
      .mockResolvedValueOnce("Queued.");

    const result = await runAssistantToolTurn(
      {
        settings,
        snapshot: { ...snapshot, allTasks: tasks, tasks, permissionLevel: "ask" },
        messages: [{ role: "user", content: "move report" }]
      },
      { generateChat, store: storeWith(tasks, updateTask) }
    );

    expect(updateTask).not.toHaveBeenCalled();
    expect(result.toolCalls[0]).toMatchObject({ name: "update_task", status: "pending" });
  });

  it("passes retrospective insights into the system prompt", async () => {
    const insightsFixture: RetrospectiveInsights = {
      windowDays: 30,
      hasData: true,
      calibration: {
        overall: { scope: "overall", estimatedMinutes: 60, actualMinutes: 90, ratio: 1.5, sampleSize: 6, confidence: "ok" },
        byCategory: []
      },
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
    let capturedSystem = "";
    const generateChat = vi.fn(async (_settings, input) => {
      capturedSystem = input.system;
      return "ok";
    });

    await runAssistantToolTurn(
      {
        settings,
        snapshot: { selectedDate: "2026-06-19", tasks: [], backlogTasks: [], categories: [], allTasks: [] },
        messages: [{ role: "user", content: "how was my week?" }],
        insights: insightsFixture
      },
      { generateChat, store: storeWith([]) }
    );

    expect(capturedSystem).toContain("History & patterns");
  });

  it("passes the current time into the system prompt", async () => {
    let capturedSystem = "";
    const generateChat = vi.fn(async (_settings, input) => {
      capturedSystem = input.system;
      return "ok";
    });

    await runAssistantToolTurn(
      {
        settings,
        snapshot,
        messages: [{ role: "user", content: "rearrange based on now" }]
      },
      { generateChat, store: storeWith([]), now: () => "2026-06-23T22:49:00.000+09:00" }
    );

    expect(capturedSystem).toContain("Current local time");
    expect(capturedSystem).toContain("22:49");
  });

  it("AI-CTX-02: includes the full local timestamp in the prompt", async () => {
    const now = "2026-06-23T22:49:13.456+09:00";
    let capturedSystem = "";
    const generateChat = vi.fn(async (_settings, input) => {
      capturedSystem = input.system;
      return "ok";
    });

    await runAssistantToolTurn(
      {
        settings,
        snapshot,
        messages: [{ role: "user", content: "from now" }]
      },
      { generateChat, store: storeWith([]), now: () => now }
    );

    expect(capturedSystem).toContain(`(${now})`);
  });

  it("AI-RETRO-01: prompt is byte-identical whether retro is absent or hasData=false (model hedges)", async () => {
    const noDataInsights: RetrospectiveInsights = {
      windowDays: 30,
      hasData: false,
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
    const capture = async (insights?: RetrospectiveInsights | null) => {
      let capturedSystem = "";
      const generateChat = vi.fn(async (_settings, input) => {
        capturedSystem = input.system;
        return "ok";
      });
      await runAssistantToolTurn(
        {
          settings,
          snapshot,
          messages: [{ role: "user", content: "how is today?" }],
          insights
        },
        { generateChat, store: storeWith([]), now: () => "2026-06-23T22:49:00.000+09:00" }
      );
      return capturedSystem;
    };

    const withoutRetro = await capture(undefined);
    const withNoData = await capture(noDataInsights);
    expect(withNoData).toBe(withoutRetro);
    expect(withNoData).not.toContain("History & patterns");
    expect(withNoData).not.toContain("low confidence");
  });
});
