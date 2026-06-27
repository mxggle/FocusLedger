import { describe, expect, it } from "vitest";
import { applySkillOps } from "./applyOps";
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

const NOW = "2026-06-25T12:00:00.000Z";
let counter = 0;
const makeId = () => `gen${counter++}`;

describe("applySkillOps", () => {
  it("creates a brand-new skill", () => {
    counter = 0;
    const result = applySkillOps(
      [],
      [{ op: "create", name: "Delay tasks", trigger: "when rescheduling", steps: "list → shift" }],
      NOW,
      makeId
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "gen0",
      name: "Delay tasks",
      trigger: "when rescheduling",
      steps: "list → shift",
      archived: false,
      pinned: false,
      useCount: 0
    });
  });

  it("deduplicates by normalized name — bumps useCount instead of creating a duplicate", () => {
    counter = 0;
    const existing = [skill({ id: "s1", name: "Delay tasks", useCount: 1 })];
    const result = applySkillOps(
      existing,
      [{ op: "create", name: "  delay TASKS ", trigger: "reschedule", steps: "do it" }],
      NOW,
      makeId
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
    expect(result[0].useCount).toBe(2);
    expect(result[0].lastUsedAt).toBe(NOW);
    expect(result[0].updatedAt).toBe(NOW);
  });

  it("updates an existing unpinned skill's fields", () => {
    counter = 0;
    const existing = [skill({ id: "s1", name: "Old skill", trigger: "old trigger", steps: "old steps" })];
    const result = applySkillOps(
      existing,
      [{ op: "update", id: "s1", trigger: "new trigger", steps: "new steps" }],
      NOW,
      makeId
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "s1",
      trigger: "new trigger",
      steps: "new steps",
      updatedAt: NOW
    });
  });

  it("archives an existing unpinned skill (soft delete)", () => {
    counter = 0;
    const existing = [skill({ id: "s1", name: "Stale skill" })];
    const result = applySkillOps(existing, [{ op: "archive", id: "s1" }], NOW, makeId);
    expect(result).toHaveLength(1);
    expect(result[0].archived).toBe(true);
    expect(result[0].updatedAt).toBe(NOW);
  });

  it("protects pinned skills from update and archive ops", () => {
    counter = 0;
    const existing = [skill({ id: "p", name: "Pinned skill", pinned: true })];
    const result = applySkillOps(
      existing,
      [
        { op: "update", id: "p", steps: "hijacked steps" },
        { op: "archive", id: "p" }
      ],
      NOW,
      makeId
    );
    // Pinned skill must remain untouched
    expect(result).toHaveLength(1);
    expect(result[0].steps).toBe("step 1\nstep 2");
    expect(result[0].archived).toBe(false);
    expect(result[0].pinned).toBe(true);
  });

  it("drops update/archive ops for unknown ids", () => {
    counter = 0;
    const result = applySkillOps([], [{ op: "archive", id: "ghost" }], NOW, makeId);
    expect(result).toEqual([]);
  });

  it("resolves a contradiction — archives the outdated skill and creates a corrected one", () => {
    counter = 0;
    const existing = [skill({ id: "s1", name: "Delay tasks", trigger: "old trigger", steps: "old steps" })];
    const result = applySkillOps(
      existing,
      [
        { op: "archive", id: "s1" },
        { op: "create", name: "Delay tasks v2", trigger: "new trigger", steps: "updated steps" }
      ],
      NOW,
      makeId
    );
    expect(result).toHaveLength(2);
    const archived = result.find((s) => s.id === "s1");
    const created = result.find((s) => s.name === "Delay tasks v2");
    expect(archived?.archived).toBe(true);
    expect(created?.steps).toBe("updated steps");
  });

  it("is immutable — does not mutate the original array or its entries", () => {
    counter = 0;
    const existing = [skill({ id: "s1", name: "Immutable skill" })];
    const original = { ...existing[0] };
    applySkillOps(existing, [{ op: "archive", id: "s1" }], NOW, makeId);
    expect(existing[0]).toEqual(original);
  });

  it("preserves existing skills that have no ops applied", () => {
    counter = 0;
    const existing = [
      skill({ id: "s1", name: "Touched skill" }),
      skill({ id: "s2", name: "Untouched skill" })
    ];
    const result = applySkillOps(existing, [{ op: "archive", id: "s1" }], NOW, makeId);
    expect(result).toHaveLength(2);
    const untouched = result.find((s) => s.id === "s2");
    expect(untouched?.archived).toBe(false);
  });
});
