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

import { restSessionRepository } from "./restSessionRepository";

describe("restSessionRepository", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.select.mockReset();
  });

  it("opens an unbounded rest session with no task link", async () => {
    const startedAt = "2026-06-29T09:00:00.000Z";
    const session = await restSessionRepository.open("auto", startedAt);

    expect(session).toMatchObject({
      start_at: startedAt,
      end_at: null,
      duration_seconds: null,
      trigger: "auto"
    });
    expect(session).not.toHaveProperty("task_id");
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0][1]).toEqual([
      session.id,
      startedAt,
      null,
      null,
      "auto",
      startedAt,
      startedAt
    ]);
  });

  it("closes an open session with a computed duration", async () => {
    const existing = {
      id: "rest_1",
      start_at: "2026-06-29T09:00:00.000Z",
      end_at: null,
      duration_seconds: null,
      trigger: "manual",
      created_at: "2026-06-29T09:00:00.000Z",
      updated_at: "2026-06-29T09:00:00.000Z"
    };
    mocks.select.mockResolvedValueOnce([existing]); // getById

    const endedAt = "2026-06-29T09:05:00.000Z";
    const closed = await restSessionRepository.close("rest_1", endedAt);

    expect(closed).toMatchObject({ end_at: endedAt, duration_seconds: 300 });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("is a no-op when closing an already-closed session", async () => {
    mocks.select.mockResolvedValueOnce([
      {
        id: "rest_1",
        start_at: "2026-06-29T09:00:00.000Z",
        end_at: "2026-06-29T09:05:00.000Z",
        duration_seconds: 300,
        trigger: "manual",
        created_at: "2026-06-29T09:00:00.000Z",
        updated_at: "2026-06-29T09:05:00.000Z"
      }
    ]);

    await restSessionRepository.close("rest_1", "2026-06-29T10:00:00.000Z");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("resumes a recent open rest and closes abandoned/extra ones", async () => {
    const now = "2026-06-29T10:00:00.000Z";
    const recent = {
      id: "rest_recent",
      start_at: "2026-06-29T09:55:00.000Z", // 5 min ago — resumable
      end_at: null,
      duration_seconds: null,
      trigger: "manual",
      created_at: "2026-06-29T09:55:00.000Z",
      updated_at: "2026-06-29T09:55:00.000Z"
    };
    const abandoned = {
      id: "rest_old",
      start_at: "2026-06-29T03:00:00.000Z", // 7h ago — abandoned
      end_at: null,
      duration_seconds: null,
      trigger: "manual",
      created_at: "2026-06-29T03:00:00.000Z",
      updated_at: "2026-06-29T03:00:00.000Z"
    };
    // repairActive: first select returns all open (newest first), then close()
    // calls getById for the abandoned one.
    mocks.select
      .mockResolvedValueOnce([recent, abandoned]) // open list
      .mockResolvedValueOnce([abandoned]); // getById inside close()

    const resumable = await restSessionRepository.repairActive(now);

    expect(resumable?.id).toBe("rest_recent");
    // Only the abandoned one is closed.
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
