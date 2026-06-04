import { beforeEach, describe, expect, it } from "vitest";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { createTimeEntryRepository } from "../src/repositories/timeEntryRepository.js";
import { createTestDb, insertCategory, insertEntry, insertTask } from "./helpers/db.js";

const iso = (h: number, m = 0) => new Date(2026, 5, 4, h, m, 0).toISOString();

describe("timeEntryRepository", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createTestDb();
    insertCategory(db, { id: "dev", name: "Development", color: "#7c3aed" });
    insertTask(db, { id: "t1", title: "Build MCP", category_id: "dev" });
    insertEntry(db, { id: "e1", task_id: "t1", start_at: iso(9), end_at: iso(10), duration_seconds: 3600 });
    insertEntry(db, { id: "e2", task_id: "t1", start_at: iso(11), end_at: iso(12), duration_seconds: 3600 });
  });

  it("joins task and category data for a range", () => {
    const repo = createTimeEntryRepository(db);
    const entries = repo.listForRange(iso(8), iso(13));
    expect(entries).toHaveLength(2);
    expect(entries[0].task_title).toBe("Build MCP");
    expect(entries[0].category_name).toBe("Development");
    expect(entries[0].category_color).toBe("#7c3aed");
  });

  it("excludes entries outside the range", () => {
    const repo = createTimeEntryRepository(db);
    const entries = repo.listForRange(iso(10, 30), iso(13));
    expect(entries.map((e) => e.id)).toEqual(["e2"]);
  });

  it("treats an open entry as running until now", () => {
    insertEntry(db, { id: "e3", task_id: "t1", start_at: iso(14), end_at: null });
    const repo = createTimeEntryRepository(db);
    const entries = repo.listForRange(iso(14, 30), iso(16), iso(15));
    expect(entries.map((e) => e.id)).toContain("e3");
  });

  it("lists all entries for a task in chronological order", () => {
    const repo = createTimeEntryRepository(db);
    const entries = repo.listForTask("t1");
    expect(entries.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});
