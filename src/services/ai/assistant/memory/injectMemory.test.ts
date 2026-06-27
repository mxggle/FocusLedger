import { describe, expect, it } from "vitest";
import { renderMemoryBlock } from "./injectMemory";
import type { MemoryEntry } from "./types";

function mem(partial: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kind: "fact", pinned: false, status: "active", sourceMessageId: null,
    useCount: 0, lastUsedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial
  };
}

describe("renderMemoryBlock", () => {
  it("returns empty string when there are no memories (additive guarantee)", () => {
    expect(renderMemoryBlock([])).toBe("");
  });

  it("renders a labelled block listing each memory", () => {
    const block = renderMemoryBlock([
      mem({ id: "a", kind: "preference", text: "Prefers mornings" }),
      mem({ id: "b", kind: "context", text: "Q3 launch is priority" })
    ]);
    expect(block).toContain("learned about the user");
    expect(block).toContain("Prefers mornings");
    expect(block).toContain("Q3 launch is priority");
  });
});
