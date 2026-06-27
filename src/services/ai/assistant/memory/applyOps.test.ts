import { describe, expect, it } from "vitest";
import { applyMemoryOps } from "./applyOps";
import type { MemoryEntry } from "./types";

function mem(partial: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kind: "fact", pinned: false, status: "active", sourceMessageId: null,
    useCount: 0, lastUsedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial
  };
}

const NOW = "2026-06-23T12:00:00.000Z";
let counter = 0;
const makeId = () => `gen${counter++}`;

describe("applyMemoryOps", () => {
  it("adds a brand-new fact", () => {
    counter = 0;
    const { writes } = applyMemoryOps([], [{ op: "add", kind: "preference", text: "Prefers mornings" }], NOW, makeId);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ kind: "add" });
    expect(writes[0]).toHaveProperty("entry.text", "Prefers mornings");
  });

  it("collapses a near-duplicate add into a usage bump", () => {
    const existing = [mem({ id: "m1", text: "Prefers mornings", useCount: 1 })];
    const { writes } = applyMemoryOps(existing, [{ op: "add", kind: "preference", text: "  prefers MORNINGS " }], NOW, makeId);
    expect(writes).toEqual([{ kind: "bumpUsage", id: "m1", useCount: 2, lastUsedAt: NOW, updatedAt: NOW }]);
  });

  it("updates text on an existing unpinned entry", () => {
    const existing = [mem({ id: "m1", text: "Old" })];
    const { writes } = applyMemoryOps(existing, [{ op: "update", id: "m1", text: "New", kind: "context" }], NOW, makeId);
    expect(writes).toEqual([{ kind: "updateText", id: "m1", text: "New", memKind: "context", updatedAt: NOW }]);
  });

  it("archives an existing unpinned entry", () => {
    const existing = [mem({ id: "m1", text: "stale" })];
    const { writes } = applyMemoryOps(existing, [{ op: "archive", id: "m1" }], NOW, makeId);
    expect(writes).toEqual([{ kind: "archive", id: "m1", updatedAt: NOW }]);
  });

  it("protects pinned entries from update and archive", () => {
    const existing = [mem({ id: "p", text: "Call me Captain", pinned: true })];
    const { writes } = applyMemoryOps(
      existing,
      [{ op: "update", id: "p", text: "Call me Skipper" }, { op: "archive", id: "p" }],
      NOW, makeId
    );
    expect(writes).toEqual([]);
  });

  it("drops update/archive for unknown ids", () => {
    const { writes } = applyMemoryOps([], [{ op: "archive", id: "ghost" }], NOW, makeId);
    expect(writes).toEqual([]);
  });

  it("keeps distinct CJK facts apart instead of collapsing them onto an empty key", () => {
    counter = 0;
    // Two genuinely different Chinese facts. The old ASCII-only normalize folded
    // both to "" and deduped the second into the first; they must stay distinct.
    const { writes } = applyMemoryOps(
      [],
      [
        { op: "add", kind: "preference", text: "喜欢早晨工作" },
        { op: "add", kind: "context", text: "下午容易分心" }
      ],
      NOW,
      makeId
    );
    expect(writes).toHaveLength(2);
    expect(writes.every((w) => w.kind === "add")).toBe(true);
  });

  it("AI-MEM-05: resolves a contradiction by archiving the outdated memory and adding the corrected one", () => {
    counter = 0;
    const existing = [mem({ id: "m1", text: "Prefers mornings", useCount: 1 })];
    const { writes } = applyMemoryOps(
      existing,
      [
        { op: "archive", id: "m1" },
        { op: "add", kind: "preference", text: "Prefers afternoons" }
      ],
      NOW,
      makeId
    );
    expect(writes).toEqual([
      { kind: "archive", id: "m1", updatedAt: NOW },
      { kind: "add", entry: expect.objectContaining({ id: "gen0", text: "Prefers afternoons", kind: "preference" }) }
    ]);
  });
});
