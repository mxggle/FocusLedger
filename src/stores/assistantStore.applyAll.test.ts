import { describe, expect, it } from "vitest";
import { nextAfterApplyAll } from "./assistantStore";
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
