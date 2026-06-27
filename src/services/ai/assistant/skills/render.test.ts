import { describe, expect, it } from "vitest";
import { renderSkillBlock } from "./render";
import type { AssistantSkill } from "./types";

function skill(partial: Partial<AssistantSkill> & { id: string; name: string }): AssistantSkill {
  return {
    trigger: "when asked to do something",
    steps: "step 1\nstep 2",
    pinned: false,
    archived: false,
    useCount: 0,
    lastUsedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial
  };
}

describe("renderSkillBlock", () => {
  it("returns empty string when there are no skills (additive guarantee)", () => {
    expect(renderSkillBlock([])).toBe("");
  });

  it("renders a labelled block with name, trigger, and steps for each skill", () => {
    const block = renderSkillBlock([
      skill({ id: "a", name: "Delay tasks", trigger: "when asked to reschedule tasks", steps: "1. List all tasks\n2. Shift each by N minutes" }),
      skill({ id: "b", name: "Morning plan", trigger: "when asked to plan the morning", steps: "1. Check calendar\n2. Prioritize" })
    ]);
    expect(block).toContain("Learned skills you can reuse");
    expect(block).toContain("Delay tasks");
    expect(block).toContain("when asked to reschedule tasks");
    expect(block).toContain("1. List all tasks");
    expect(block).toContain("Morning plan");
    expect(block).toContain("when asked to plan the morning");
  });

  it("is byte-identical to empty string when given empty array (no prompt bloat)", () => {
    const block = renderSkillBlock([]);
    expect(block).toBe("");
    expect(block.length).toBe(0);
  });

  it("renders a single skill correctly", () => {
    const block = renderSkillBlock([
      skill({ id: "x", name: "Batch emails", trigger: "when processing multiple emails", steps: "group by sender then reply" })
    ]);
    expect(block).toContain("Batch emails");
    expect(block).toContain("when processing multiple emails");
    expect(block).toContain("group by sender then reply");
  });
});
