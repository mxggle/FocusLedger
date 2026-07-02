import { describe, expect, it } from "vitest";
import { rankSkills, SKILL_INJECT_K } from "./rank";
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

describe("rankSkills", () => {
  it("ranks keyword-overlapping skills first", () => {
    const all = [
      skill({ id: "a", name: "Delay tasks", trigger: "when asked to delay or reschedule tasks", steps: "shift all tasks forward" }),
      skill({ id: "b", name: "Cook pasta", trigger: "when user wants to cook pasta", steps: "boil water" })
    ];
    const ranked = rankSkills(all, "delay all my morning tasks by 30 minutes", 5);
    expect(ranked[0].id).toBe("a");
  });

  it("caps results at k", () => {
    const all = Array.from({ length: 20 }, (_, i) =>
      skill({ id: `s${i}`, name: `Skill ${i}`, trigger: `trigger for task ${i}`, steps: "do task planning" })
    );
    expect(rankSkills(all, "task planning", 5)).toHaveLength(5);
  });

  it("matches Chinese messages against Chinese skills (CJK bigrams)", () => {
    const all = [
      skill({ id: "cn", name: "整理任务", trigger: "当用户要求整理或重新安排任务", steps: "列出任务并重新排序" }),
      skill({ id: "b", name: "Cook pasta", trigger: "when user wants to cook pasta", steps: "boil water" })
    ];
    const ranked = rankSkills(all, "帮我整理一下今天的任务", 5);
    expect(ranked[0]?.id).toBe("cn");
  });

  it("always includes pinned skills even with no keyword match", () => {
    const all = [
      skill({ id: "pin", name: "Special ritual", trigger: "pinned special skill", steps: "do it", pinned: true }),
      skill({ id: "x", name: "Unrelated skill", trigger: "when debugging code", steps: "check logs" })
    ];
    const ranked = rankSkills(all, "unrelated query about lunch", 5);
    expect(ranked.map((s) => s.id)).toContain("pin");
  });

  it("excludes archived skills", () => {
    const all = [
      skill({ id: "active", name: "Active skill", trigger: "when planning the day", steps: "list tasks" }),
      skill({ id: "arch", name: "Archived skill", trigger: "when planning the day", steps: "old steps", archived: true })
    ];
    const ranked = rankSkills(all, "planning the day", 5);
    expect(ranked.map((s) => s.id)).not.toContain("arch");
  });

  it("returns an empty array for no entries", () => {
    expect(rankSkills([], "anything", 5)).toEqual([]);
  });

  it("exports a sensible default K", () => {
    expect(SKILL_INJECT_K).toBe(5);
  });

  it("is deterministic — identical inputs produce identical rankings", () => {
    const all = [
      skill({ id: "a", name: "Delay tasks", trigger: "reschedule tasks", steps: "shift forward", useCount: 2 }),
      skill({ id: "b", name: "Morning plan", trigger: "plan morning routine", steps: "list priorities", useCount: 1 }),
      skill({ id: "c", name: "Batch admin", trigger: "batch admin tasks on Fridays", steps: "group by type", useCount: 0, pinned: true }),
      skill({ id: "d", name: "Code review", trigger: "when reviewing code", steps: "read diff", useCount: 3 })
    ];
    const first = rankSkills(all, "reschedule my morning tasks", 5);
    const second = rankSkills(all, "reschedule my morning tasks", 5);
    expect(second).toEqual(first);
  });

  it("breaks score ties stably by preserving input order", () => {
    const all = [
      skill({ id: "first", name: "Plan A", trigger: "planning task A", steps: "do A" }),
      skill({ id: "second", name: "Plan B", trigger: "planning task B", steps: "do B" })
    ];
    const ranked = rankSkills(all, "planning", 5);
    expect(ranked.map((s) => s.id)).toEqual(["first", "second"]);
  });

  it("boosts pinned skills score over unpinned with same keywords", () => {
    const all = [
      skill({ id: "unpinned", name: "Normal task plan", trigger: "planning daily tasks", steps: "do steps" }),
      skill({ id: "pinned", name: "Pinned task plan", trigger: "planning daily tasks", steps: "do steps", pinned: true })
    ];
    const ranked = rankSkills(all, "planning daily tasks", 5);
    expect(ranked[0].id).toBe("pinned");
  });
});
