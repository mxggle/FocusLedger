import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn()
}));

vi.mock("./client", () => ({
  getDatabase: vi.fn(async () => ({
    execute: mocks.execute
  }))
}));

import { timeEntryRepository } from "./timeEntryRepository";

describe("timeEntryRepository.createReflectionEntry", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
  });

  it("persists reflection as a closed zero-duration entry", async () => {
    const recordedAt = "2026-06-18T09:30:00.000Z";

    const entry = await timeEntryRepository.createReflectionEntry(
      "task-1",
      {
        note: "  Finished the draft  ",
        blocker: "  Waiting on review  ",
        next_action: "  Send it  ",
        completion_rate: 100
      },
      recordedAt
    );

    expect(entry).toMatchObject({
      task_id: "task-1",
      start_at: recordedAt,
      end_at: recordedAt,
      duration_seconds: 0,
      note: "Finished the draft",
      blocker: "Waiting on review",
      next_action: "Send it",
      completion_rate: 100
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0][1]).toEqual([
      entry.id,
      "task-1",
      recordedAt,
      recordedAt,
      0,
      "Finished the draft",
      "Waiting on review",
      "Send it",
      100,
      recordedAt,
      recordedAt
    ]);
  });
});
