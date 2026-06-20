import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../services/ai/assistant/types";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn()
}));

vi.mock("./client", () => ({
  getDatabase: vi.fn(async () => ({
    execute: mocks.execute,
    select: mocks.select
  }))
}));

import { assistantMessageRepository } from "./assistantMessageRepository";

describe("assistantMessageRepository", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.select.mockReset();
  });

  it("append inserts the message with actions serialized to JSON", async () => {
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "Here is a plan.",
      createdAt: "2026-06-20T10:00:00.000Z",
      actions: [
        { id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "pending" }
      ]
    };

    await assistantMessageRepository.append(message);

    expect(mocks.execute).toHaveBeenCalledOnce();
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO assistant_messages");
    expect(params[0]).toBe("m1");
    expect(params[1]).toBe("assistant");
    expect(params[2]).toBe("Here is a plan.");
    expect(JSON.parse(params[3])).toHaveLength(1);
    expect(params[4]).toBe("2026-06-20T10:00:00.000Z");
  });

  it("append stores null actions for a user message", async () => {
    const message: ChatMessage = {
      id: "u1",
      role: "user",
      content: "add X",
      createdAt: "2026-06-20T09:59:00.000Z"
    };
    await assistantMessageRepository.append(message);
    expect(mocks.execute.mock.calls[0][1][3]).toBeNull();
  });

  it("getRecent returns rows oldest-first and parses actions JSON", async () => {
    // DB returns newest-first (matching the SQL ORDER BY DESC + LIMIT).
    mocks.select.mockResolvedValue([
      { id: "m2", role: "assistant", content: "second", actions: null, created_at: "2026-06-20T10:01:00.000Z" },
      { id: "m1", role: "user", content: "first", actions: null, created_at: "2026-06-20T10:00:00.000Z" }
    ]);

    const result = await assistantMessageRepository.getRecent(40);

    const [sql, params] = mocks.select.mock.calls[0];
    expect(sql).toContain("ORDER BY created_at DESC");
    expect(params).toEqual([40]);
    // Re-sorted to chronological order for display.
    expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(result[0].createdAt).toBe("2026-06-20T10:00:00.000Z");
  });

  it("getRecent parses a non-null actions column back into an array", async () => {
    mocks.select.mockResolvedValue([
      {
        id: "m3",
        role: "assistant",
        content: "plan",
        actions: JSON.stringify([{ id: "a1", type: "create_task", params: {}, summary: "S", destructive: false, status: "applied" }]),
        created_at: "2026-06-20T10:02:00.000Z"
      }
    ]);
    const result = await assistantMessageRepository.getRecent(10);
    expect(result[0].actions).toHaveLength(1);
    expect(result[0].actions?.[0].status).toBe("applied");
  });

  it("clear deletes all rows", async () => {
    await assistantMessageRepository.clear();
    expect(mocks.execute).toHaveBeenCalledWith("DELETE FROM assistant_messages");
  });
});
