import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "./reviewPrompt";
import type { MemoryEntry } from "./types";

function mem(partial: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kind: "fact", pinned: false, status: "active", sourceMessageId: null,
    useCount: 0, lastUsedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial
  };
}

describe("buildReviewPrompt", () => {
  it("instructs JSON-array output and includes the exchange", () => {
    const { system, messages } = buildReviewPrompt(
      { userText: "I batch admin on Fridays", assistantText: "Noted." },
      []
    );
    expect(system).toMatch(/JSON array/i);
    expect(system).toMatch(/preference|work style|persona/i);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("I batch admin on Fridays");
    expect(messages[0].content).toContain("Noted.");
  });

  it("lists existing memories with ids so the model can dedup/update/archive", () => {
    const { messages } = buildReviewPrompt(
      { userText: "actually I prefer afternoons now", assistantText: "Updated." },
      [mem({ id: "m1", kind: "preference", text: "Prefers mornings" })]
    );
    expect(messages[0].content).toContain("m1");
    expect(messages[0].content).toContain("Prefers mornings");
  });
});
