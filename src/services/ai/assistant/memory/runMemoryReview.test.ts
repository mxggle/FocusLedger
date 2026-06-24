import { describe, expect, it, vi } from "vitest";
import { runMemoryReview } from "./runMemoryReview";
import type { MemoryEntry } from "./types";
import type { AiSettings } from "../../providers";

const settings = { aiProvider: "anthropic", aiApiKey: "k", aiModel: "m", aiBaseUrl: "" } as unknown as AiSettings;

function deps(generateChat: ReturnType<typeof vi.fn>) {
  return {
    generateChat,
    repo: {
      add: vi.fn(async () => {}), updateText: vi.fn(async () => {}),
      bumpUsage: vi.fn(async () => {}), archive: vi.fn(async () => {})
    },
    makeId: () => "gen1",
    now: () => "2026-06-23T12:00:00.000Z"
  };
}

describe("runMemoryReview", () => {
  it("short-circuits trivial turns without calling the model", async () => {
    const generateChat = vi.fn();
    const d = deps(generateChat);
    await runMemoryReview({ settings, userText: "thanks", assistantText: "np", existing: [] }, d);
    expect(generateChat).not.toHaveBeenCalled();
    expect(d.repo.add).not.toHaveBeenCalled();
  });

  it("persists an added memory on a substantive turn", async () => {
    const generateChat = vi.fn(async () => '[{"op":"add","kind":"preference","text":"Prefers mornings"}]');
    const d = deps(generateChat);
    await runMemoryReview(
      { settings, userText: "I always work best in the mornings", assistantText: "Noted.", existing: [] },
      d
    );
    expect(generateChat).toHaveBeenCalledOnce();
    expect(d.repo.add).toHaveBeenCalledOnce();
    expect(d.repo.add).toHaveBeenCalledWith(expect.objectContaining({ text: "Prefers mornings", id: "gen1" }));
  });

  it("swallows model errors without throwing", async () => {
    const generateChat = vi.fn(async () => { throw new Error("network"); });
    const d = deps(generateChat);
    await expect(
      runMemoryReview({ settings, userText: "I prefer afternoons always", assistantText: "ok", existing: [] }, d)
    ).resolves.toBeUndefined();
    expect(d.repo.add).not.toHaveBeenCalled();
  });

  it("routes an archive op to repo.archive", async () => {
    const generateChat = vi.fn(async () => '[{"op":"archive","id":"m1"}]');
    const d = deps(generateChat);
    const existing: MemoryEntry[] = [{
      id: "m1", kind: "fact", text: "old", pinned: false, status: "active", sourceMessageId: null,
      useCount: 0, lastUsedAt: null, createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z"
    }];
    await runMemoryReview({ settings, userText: "that is no longer true, please forget it", assistantText: "ok", existing }, d);
    expect(d.repo.archive).toHaveBeenCalledWith("m1", "2026-06-23T12:00:00.000Z");
  });

  it("AI-MEM-07: drops non-JSON model output without throwing or persisting", async () => {
    const generateChat = vi.fn(async () => "I don't think there's anything to remember here.");
    const d = deps(generateChat);
    await expect(
      runMemoryReview({ settings, userText: "I prefer afternoons always", assistantText: "ok", existing: [] }, d)
    ).resolves.toBeUndefined();
    expect(d.repo.add).not.toHaveBeenCalled();
    expect(d.repo.archive).not.toHaveBeenCalled();
  });

  it("AI-MEM-07: drops malformed JSON without throwing or persisting", async () => {
    const generateChat = vi.fn(async () => "[{op: add, kind: preference, text: x}]");
    const d = deps(generateChat);
    await expect(
      runMemoryReview({ settings, userText: "I prefer afternoons always", assistantText: "ok", existing: [] }, d)
    ).resolves.toBeUndefined();
    expect(d.repo.add).not.toHaveBeenCalled();
    expect(d.repo.updateText).not.toHaveBeenCalled();
  });
});
