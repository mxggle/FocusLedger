import { describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "./agentLoop";
import type { AssistantStoreSnapshot } from "./contextBuilder";

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-20",
  tasks: [],
  backlogTasks: [],
  categories: [],
  allTasks: []
};

describe("runAgentLoop", () => {
  it("executes a lookup, feeds results back, then finalizes", async () => {
    const generateChat = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ lookups: [{ tool: "search_tasks", query: "report" }] }))
      .mockResolvedValueOnce(JSON.stringify({ reply: "All set.", actions: [] }));
    const steps: string[] = [];

    const result = await runAgentLoop(
      {
        settings: {} as never,
        snapshot,
        messages: [{ role: "user", content: "plan my notes" }],
        onStep: (s) => steps.push(s)
      },
      { generateChat }
    );

    expect(generateChat).toHaveBeenCalledTimes(2);
    const secondMessages = generateChat.mock.calls[1][1].messages;
    expect(JSON.stringify(secondMessages)).toContain("search_tasks");
    expect(result.reply).toBe("All set.");
    expect(steps.length).toBeGreaterThan(0);
  });

  it("finalizes immediately when the first response is final", async () => {
    const generateChat = vi.fn().mockResolvedValue(JSON.stringify({ reply: "hi", actions: [] }));
    const result = await runAgentLoop(
      { settings: {} as never, snapshot, messages: [{ role: "user", content: "hi" }] },
      { generateChat }
    );
    expect(generateChat).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe("hi");
  });

  it("stops after the step budget and finalizes the last response", async () => {
    const generateChat = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ lookups: [{ tool: "search_tasks", query: "x" }] }));
    const result = await runAgentLoop(
      { settings: {} as never, snapshot, messages: [{ role: "user", content: "loop" }] },
      { generateChat }
    );
    expect(generateChat.mock.calls.length).toBeLessThanOrEqual(5);
    expect(result).toHaveProperty("reply");
  });
});
