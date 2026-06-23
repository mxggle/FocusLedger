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

  it("append stores tool calls in the existing JSON column", async () => {
    const message: ChatMessage = {
      id: "m-tool",
      role: "assistant",
      content: "Done.",
      createdAt: "2026-06-20T10:00:00.000Z",
      toolCalls: [
        {
          id: "tc1",
          name: "update_task",
          args: { task_id: "t1", planned_start_time: "09:30" },
          category: "write",
          destructive: false,
          summary: "Updated Report",
          status: "executed"
        }
      ]
    };

    await assistantMessageRepository.append(message);

    const params = mocks.execute.mock.calls[0][1];
    const payload = JSON.parse(params[3]);
    expect(mocks.execute.mock.calls[0][0]).toContain("INSERT INTO assistant_messages");
    expect(payload[0]).toMatchObject({ id: "tc1", name: "update_task", status: "executed" });
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

  it("getRecent returns rows oldest-first", async () => {
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

  it("getRecent ignores legacy action-shaped JSON", async () => {
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
    expect(result[0].toolCalls).toBeUndefined();
  });

  it("getRecent parses tool call payloads back into toolCalls", async () => {
    mocks.select.mockResolvedValue([
      {
        id: "m4",
        role: "assistant",
        content: "done",
        actions: JSON.stringify([
          {
            id: "tc1",
            name: "update_task",
            args: { task_id: "t1" },
            category: "write",
            destructive: false,
            summary: "Updated",
            status: "executed"
          }
        ]),
        created_at: "2026-06-20T10:03:00.000Z"
      }
    ]);
    const result = await assistantMessageRepository.getRecent(10);
    expect(result[0].toolCalls).toHaveLength(1);
    expect(result[0].toolCalls?.[0].name).toBe("update_task");
  });

  it("clear deletes all rows", async () => {
    await assistantMessageRepository.clear();
    expect(mocks.execute).toHaveBeenCalledWith("DELETE FROM assistant_messages");
  });

  it("deleteOne deletes a single row by id", async () => {
    await assistantMessageRepository.deleteOne("m9");
    expect(mocks.execute).toHaveBeenCalledWith(
      "DELETE FROM assistant_messages WHERE id = $1",
      ["m9"]
    );
  });

  it("deleteAfter looks up created_at then deletes newer rows", async () => {
    mocks.select.mockResolvedValueOnce([{ created_at: "2026-06-20T10:00:00.000Z" }]);

    await assistantMessageRepository.deleteAfter("m1");

    const selectCall = mocks.select.mock.calls[0];
    expect(selectCall[0]).toContain("SELECT created_at FROM assistant_messages");
    expect(selectCall[1]).toEqual(["m1"]);
    const deleteCall = mocks.execute.mock.calls[0];
    expect(deleteCall[0]).toBe("DELETE FROM assistant_messages WHERE created_at > $1");
    expect(deleteCall[1]).toEqual(["2026-06-20T10:00:00.000Z"]);
  });

  it("deleteAfter is a no-op when the id is not found", async () => {
    mocks.select.mockResolvedValueOnce([]);
    await assistantMessageRepository.deleteAfter("missing");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
