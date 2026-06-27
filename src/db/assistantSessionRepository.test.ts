import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { assistantSessionRepository } from "./assistantSessionRepository";

describe("assistantSessionRepository", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.select.mockReset();
  });

  it("create inserts with matching created/updated timestamps", async () => {
    await assistantSessionRepository.create({ id: "s1", title: "Plan", createdAt: "2026-06-27T10:00:00.000Z" });
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO assistant_sessions");
    expect(params).toEqual(["s1", "Plan", "2026-06-27T10:00:00.000Z"]);
  });

  it("list returns sessions newest-active first with empty title coalesced", async () => {
    mocks.select.mockResolvedValue([
      { id: "s2", title: null, created_at: "2026-06-27T09:00:00.000Z", updated_at: "2026-06-27T11:00:00.000Z" }
    ]);
    const result = await assistantSessionRepository.list();
    expect(mocks.select.mock.calls[0][0]).toContain("ORDER BY updated_at DESC");
    expect(result[0]).toEqual({
      id: "s2",
      title: "",
      createdAt: "2026-06-27T09:00:00.000Z",
      updatedAt: "2026-06-27T11:00:00.000Z"
    });
  });

  it("setTitleIfEmpty only updates when title is blank", async () => {
    await assistantSessionRepository.setTitleIfEmpty("s1", "Derived");
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain("title IS NULL OR title = ''");
    expect(params).toEqual(["Derived", "s1"]);
  });

  it("delete removes the session's messages then the session", async () => {
    await assistantSessionRepository.delete("s1");
    expect(mocks.execute.mock.calls[0][0]).toBe("DELETE FROM assistant_messages WHERE session_id = $1");
    expect(mocks.execute.mock.calls[1][0]).toBe("DELETE FROM assistant_sessions WHERE id = $1");
    expect(mocks.execute.mock.calls[0][1]).toEqual(["s1"]);
  });
});
