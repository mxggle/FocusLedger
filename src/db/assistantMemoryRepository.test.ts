import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryEntry } from "../services/ai/assistant/memory/types";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn() }));
vi.mock("./client", () => ({
  getDatabase: vi.fn(async () => ({ execute: mocks.execute, select: mocks.select }))
}));

import { assistantMemoryRepository } from "./assistantMemoryRepository";

function entry(): MemoryEntry {
  return {
    id: "m1", kind: "preference", text: "Prefers mornings", pinned: false, status: "active",
    sourceMessageId: null, useCount: 0, lastUsedAt: null,
    createdAt: "2026-06-23T00:00:00.000Z", updatedAt: "2026-06-23T00:00:00.000Z"
  };
}

describe("assistantMemoryRepository", () => {
  beforeEach(() => { mocks.execute.mockReset(); mocks.select.mockReset(); });

  it("getActive selects active rows and maps pinned to boolean", async () => {
    mocks.select.mockResolvedValue([
      { id: "m1", kind: "preference", text: "x", pinned: 1, status: "active",
        source_message_id: null, use_count: 2, last_used_at: null,
        created_at: "2026-06-23T00:00:00.000Z", updated_at: "2026-06-23T00:00:00.000Z" }
    ]);
    const result = await assistantMemoryRepository.getActive();
    expect(mocks.select.mock.calls[0][0]).toContain("WHERE status = 'active'");
    expect(result[0].pinned).toBe(true);
    expect(result[0].useCount).toBe(2);
  });

  it("add inserts all columns", async () => {
    await assistantMemoryRepository.add(entry());
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO assistant_memory");
    expect(params[0]).toBe("m1");
    expect(params[3]).toBe(0); // pinned false → 0
  });

  it("archive flips status", async () => {
    await assistantMemoryRepository.archive("m1", "2026-06-23T01:00:00.000Z");
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain("UPDATE assistant_memory SET status = 'archived'");
    expect(params).toEqual(["2026-06-23T01:00:00.000Z", "m1"]);
  });

  it("setPinned writes the integer flag", async () => {
    await assistantMemoryRepository.setPinned("m1", true, "2026-06-23T01:00:00.000Z");
    expect(mocks.execute.mock.calls[0][1]).toEqual([1, "2026-06-23T01:00:00.000Z", "m1"]);
  });
});
