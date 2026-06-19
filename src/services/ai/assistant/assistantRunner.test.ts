import { describe, expect, it, vi } from "vitest";
import { runAssistantTurn } from "./assistantRunner";
import type { AssistantStoreSnapshot } from "./contextBuilder";
import type { ChatTurn } from "../providers";
import type { RetrospectiveInsights } from "../../retrospect/types";

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-18",
  tasks: [],
  backlogTasks: [],
  categories: [{ id: "c1", name: "Deep Work" } as never]
};

const settings = { aiProvider: "anthropic" as const, aiApiKey: "k", aiModel: "", aiBaseUrl: "" };

describe("runAssistantTurn", () => {
  it("builds context, calls generateChat with system + messages, parses result", async () => {
    const generateChat = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ reply: "Done", actions: [] }));
    const messages: ChatTurn[] = [{ role: "user", content: "hi" }];

    const result = await runAssistantTurn(
      { settings, snapshot, messages },
      { generateChat }
    );

    expect(generateChat).toHaveBeenCalledTimes(1);
    const callArg = generateChat.mock.calls[0][1];
    expect(callArg.system).toContain("Yolo Assistant");
    expect(callArg.messages).toEqual(messages);
    expect(result.reply).toBe("Done");
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
      return JSON.stringify({ reply: "ok", actions: [] });
    });

    await runAssistantTurn(
      {
        settings: {} as never,
        snapshot: { selectedDate: "2026-06-19", tasks: [], backlogTasks: [], categories: [] },
        messages: [{ role: "user", content: "how was my week?" }],
        insights: insightsFixture
      },
      { generateChat }
    );

    expect(capturedSystem).toContain("History & patterns");
  });
});
