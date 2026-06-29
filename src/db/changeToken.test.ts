import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabase } from "./client";
import { readTaskDataChangeToken } from "./changeToken";
import type { SqlDatabase } from "./types";

vi.mock("./client", () => ({
  getDatabase: vi.fn()
}));

describe("readTaskDataChangeToken", () => {
  const select = vi.fn();

  beforeEach(() => {
    select.mockReset();
    vi.mocked(getDatabase).mockResolvedValue({
      select,
      execute: vi.fn()
    } satisfies SqlDatabase);
  });

  it("combines row counts and latest updates for task-store tables", async () => {
    select.mockResolvedValue([
      {
        tasks_count: 2,
        tasks_updated_at: "2026-06-29T00:00:01.000Z",
        time_entries_count: 1,
        time_entries_updated_at: "2026-06-29T00:00:02.000Z",
        categories_count: 8,
        categories_updated_at: "2026-06-29T00:00:03.000Z",
        task_templates_count: 3,
        task_templates_updated_at: "2026-06-29T00:00:04.000Z",
        template_occurrences_count: 0,
        template_occurrences_updated_at: null
      }
    ]);

    await expect(readTaskDataChangeToken()).resolves.toBe(
      [
        "2:2026-06-29T00:00:01.000Z",
        "1:2026-06-29T00:00:02.000Z",
        "8:2026-06-29T00:00:03.000Z",
        "3:2026-06-29T00:00:04.000Z",
        "0:"
      ].join("|")
    );
  });

  it("returns an empty token when SQLite returns no aggregate row", async () => {
    select.mockResolvedValue([]);

    await expect(readTaskDataChangeToken()).resolves.toBe("");
  });
});
