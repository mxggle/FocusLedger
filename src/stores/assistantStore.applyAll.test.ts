import { describe, expect, it } from "vitest";
import { nextAfterApplyAll, restoreHistoryActions } from "./assistantStore";
import type { ChatMessage } from "../services/ai/assistant/types";

const message: ChatMessage = {
  id: "m1",
  role: "assistant",
  content: "plan",
  createdAt: "2026-06-20T00:00:00Z",
  actions: [
    { id: "a1", type: "create_task", params: {}, summary: "A", destructive: false, status: "pending" },
    { id: "a2", type: "create_task", params: {}, summary: "B", destructive: false, status: "applied" },
    { id: "a3", type: "drop_task", params: {}, summary: "C", destructive: true, status: "pending" }
  ]
};

describe("nextAfterApplyAll", () => {
  it("returns only pending, non-destructive action ids for a message", () => {
    expect(nextAfterApplyAll([message], "m1")).toEqual(["a1"]);
  });

  it("returns an empty array for an unknown message", () => {
    expect(nextAfterApplyAll([message], "nope")).toEqual([]);
  });
});

describe("restoreHistoryActions", () => {
  it("downgrades pending actions to dismissed and leaves terminal ones intact", () => {
    const restored = restoreHistoryActions([message]);
    const actions = restored[0].actions!;
    expect(actions.find((a) => a.id === "a1")?.status).toBe("dismissed"); // was pending
    expect(actions.find((a) => a.id === "a2")?.status).toBe("applied"); // unchanged
    expect(actions.find((a) => a.id === "a3")?.status).toBe("dismissed"); // was pending
  });

  it("leaves messages without actions untouched", () => {
    const plain: ChatMessage = { id: "u1", role: "user", content: "hi", createdAt: "2026-06-20T00:00:00Z" };
    expect(restoreHistoryActions([plain])[0]).toBe(plain);
  });
});
