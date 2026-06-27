import { describe, expect, it } from "vitest";
import { recallConversationsTool } from "./recallConversations";
import type { AgentToolDeps, ConversationRecallEntry } from "./types";

function depsWith(conversations?: ConversationRecallEntry[]): AgentToolDeps {
  return { conversations } as AgentToolDeps;
}

const past: ConversationRecallEntry[] = [
  { role: "user", content: "Help me plan the Q3 marketing launch", createdAt: "2026-06-01T10:00:00.000Z" },
  { role: "assistant", content: "Here is a draft schedule for the launch", createdAt: "2026-06-01T10:01:00.000Z" },
  { role: "user", content: "What should I eat for lunch", createdAt: "2026-06-02T12:00:00.000Z" }
];

describe("recallConversationsTool", () => {
  it("is a non-destructive read tool", () => {
    expect(recallConversationsTool.category).toBe("read");
    expect(recallConversationsTool.destructive).toBe(false);
  });

  it("reports gracefully when there are no past conversations", async () => {
    const res = await recallConversationsTool.execute({ query: "launch" }, depsWith([]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.summary).toContain("no earlier conversations");
  });

  it("ranks matching past messages by keyword overlap", async () => {
    const res = await recallConversationsTool.execute({ query: "launch schedule" }, depsWith(past));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary).toContain("launch");
      expect(Array.isArray(res.data)).toBe(true);
      expect((res.data as ConversationRecallEntry[]).length).toBeGreaterThan(0);
    }
  });

  it("returns no matches for an unrelated query", async () => {
    const res = await recallConversationsTool.execute({ query: "taxes" }, depsWith(past));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.summary).toContain("no matching past discussion");
  });

  it("fails on an empty query", async () => {
    const res = await recallConversationsTool.execute({ query: "" }, depsWith(past));
    expect(res.ok).toBe(false);
  });
});
