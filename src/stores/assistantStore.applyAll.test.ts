import { describe, expect, it } from "vitest";
import { restoreHistoryActions } from "./assistantStore";
import type { ChatMessage } from "../services/ai/assistant/types";

const message: ChatMessage = {
  id: "m1",
  role: "assistant",
  content: "plan",
  createdAt: "2026-06-20T00:00:00Z",
  toolCalls: [
    {
      id: "tc1",
      name: "update_task",
      args: { task_id: "t1" },
      category: "write",
      destructive: false,
      summary: "A",
      status: "pending"
    },
    {
      id: "tc2",
      name: "update_task",
      args: { task_id: "t2" },
      category: "write",
      destructive: false,
      summary: "B",
      status: "executed"
    }
  ]
};

describe("restoreHistoryActions", () => {
  it("downgrades pending tool calls to dismissed and leaves terminal ones intact", () => {
    const restored = restoreHistoryActions([message]);
    const calls = restored[0].toolCalls!;
    expect(calls.find((call) => call.id === "tc1")?.status).toBe("dismissed");
    expect(calls.find((call) => call.id === "tc2")?.status).toBe("executed");
  });

  it("leaves messages without tool calls untouched", () => {
    const plain: ChatMessage = { id: "u1", role: "user", content: "hi", createdAt: "2026-06-20T00:00:00Z" };
    expect(restoreHistoryActions([plain])[0]).toBe(plain);
  });
});
