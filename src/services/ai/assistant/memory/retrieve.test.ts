import { describe, expect, it } from "vitest";
import { rankMemories, MEMORY_INJECT_K } from "./retrieve";
import type { MemoryEntry } from "./types";

function mem(partial: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kind: "fact",
    pinned: false,
    status: "active",
    sourceMessageId: null,
    useCount: 0,
    lastUsedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial
  };
}

describe("rankMemories", () => {
  it("ranks keyword-overlapping memories first", () => {
    const all = [
      mem({ id: "a", text: "Prefers deep work in the morning" }),
      mem({ id: "b", text: "Likes spicy food" })
    ];
    const ranked = rankMemories(all, "plan my morning work block", 5);
    expect(ranked[0].id).toBe("a");
  });

  it("caps results at k", () => {
    const all = Array.from({ length: 20 }, (_, i) => mem({ id: `m${i}`, text: `task ${i} planning` }));
    expect(rankMemories(all, "planning", 5)).toHaveLength(5);
  });

  it("always includes pinned entries even with no keyword match", () => {
    const all = [
      mem({ id: "pin", text: "Address me as Captain", pinned: true }),
      mem({ id: "x", text: "Uses VS Code" })
    ];
    const ranked = rankMemories(all, "unrelated query about lunch", 5);
    expect(ranked.map((m) => m.id)).toContain("pin");
  });

  it("returns an empty array for no entries", () => {
    expect(rankMemories([], "anything", 5)).toEqual([]);
  });

  it("exports a sensible default K", () => {
    expect(MEMORY_INJECT_K).toBe(8);
  });

  it("AI-MEM-08: is deterministic — identical inputs produce identical rankings", () => {
    const all = [
      mem({ id: "a", text: "Prefers deep work in the morning", useCount: 2 }),
      mem({ id: "b", text: "Likes spicy food", useCount: 1 }),
      mem({ id: "c", text: "Morning routine includes exercise", useCount: 0, pinned: true }),
      mem({ id: "d", text: "Uses VS Code for frontend work", useCount: 3 })
    ];
    const first = rankMemories(all, "plan my morning work block", 5);
    const second = rankMemories(all, "plan my morning work block", 5);
    expect(second).toEqual(first);
  });

  it("AI-MEM-08: breaks score ties stably by preserving input order", () => {
    const all = [
      mem({ id: "first", text: "planning task A", useCount: 0 }),
      mem({ id: "second", text: "planning task B", useCount: 0 })
    ];
    const ranked = rankMemories(all, "planning", 5);
    expect(ranked.map((m) => m.id)).toEqual(["first", "second"]);
  });
});
