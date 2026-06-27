import { describe, expect, it } from "vitest";
import { shouldExtractSkill } from "./gate";

describe("shouldExtractSkill", () => {
  it("returns true when there are 2 or more executed tool calls", () => {
    expect(shouldExtractSkill({ toolCallCount: 2, assistantText: "Done." })).toBe(true);
    expect(shouldExtractSkill({ toolCallCount: 5, assistantText: "Completed." })).toBe(true);
  });

  it("returns false for a single tool call (trivial turn)", () => {
    expect(shouldExtractSkill({ toolCallCount: 1, assistantText: "Listed your tasks." })).toBe(false);
  });

  it("returns false for zero tool calls (ack or simple reply)", () => {
    expect(shouldExtractSkill({ toolCallCount: 0, assistantText: "Sure, I can help with that." })).toBe(false);
  });

  it("returns false when assistant text is a trivial acknowledgement with many tools (edge: still check tool count first)", () => {
    // 2 tool calls → true even if text is trivial
    expect(shouldExtractSkill({ toolCallCount: 2, assistantText: "ok" })).toBe(true);
  });

  it("returns false when tool call count is not provided (undefined treated as 0)", () => {
    expect(shouldExtractSkill({ toolCallCount: undefined, assistantText: "I searched and found results." })).toBe(false);
  });

  it("returns false when tool call count is null (treated as 0)", () => {
    expect(shouldExtractSkill({ toolCallCount: null, assistantText: "Some answer." })).toBe(false);
  });
});
