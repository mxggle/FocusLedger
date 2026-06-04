import { beforeEach, describe, expect, it } from "vitest";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { createContext } from "../src/context.js";
import { createTestDb, insertCategory, insertEntry, insertTask } from "./helpers/db.js";

const at = (h: number, m = 0, day = 4) => new Date(2026, 5, day, h, m, 0).toISOString();

describe("summaryService.forDate", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createTestDb();
    insertCategory(db, { id: "dev", name: "Development", color: "#7c3aed" });
    insertCategory(db, { id: "life", name: "Life", color: "#ea580c" });
  });

  it("totals focus time and splits it by category", () => {
    insertTask(db, { id: "t1", category_id: "dev", due_date: "2026-06-04", estimated_minutes: 90 });
    insertTask(db, { id: "t2", category_id: "life", due_date: "2026-06-04", estimated_minutes: 30 });
    insertEntry(db, { id: "e1", task_id: "t1", start_at: at(9), end_at: at(10), duration_seconds: 3600 });
    insertEntry(db, { id: "e2", task_id: "t2", start_at: at(11), end_at: at(11, 30), duration_seconds: 1800 });

    const ctx = createContext(db);
    const summary = ctx.summary.forDate("2026-06-04");

    expect(summary.totalFocusSeconds).toBe(5400);
    expect(summary.actualMinutes).toBe(90);
    expect(summary.estimatedMinutes).toBe(120);
    expect(summary.driftMinutes).toBe(-30);
    expect(summary.byCategory[0]).toMatchObject({ categoryId: "dev", minutes: 60 });
    expect(summary.byCategory.map((c) => c.categoryId)).toEqual(["dev", "life"]);
    expect(summary.entryCount).toBe(2);
  });

  it("splits a cross-midnight entry across both days", () => {
    insertTask(db, { id: "t1", category_id: "dev" });
    insertEntry(db, {
      id: "e1",
      task_id: "t1",
      start_at: at(23, 30, 4),
      end_at: at(0, 30, 5),
      duration_seconds: 3600
    });

    const ctx = createContext(db);
    // Day boundary ends at 23:59:59.999 (identical to the app's stats), so the
    // first half rounds to 1799s and the second to 1800s — ~1800 each.
    const day4 = ctx.summary.forDate("2026-06-04").totalFocusSeconds;
    const day5 = ctx.summary.forDate("2026-06-05").totalFocusSeconds;
    expect(day4).toBeGreaterThanOrEqual(1799);
    expect(day4).toBeLessThanOrEqual(1800);
    expect(day5).toBe(1800);
    expect(day4 + day5).toBeGreaterThanOrEqual(3599);
  });

  it("counts tasks completed and dropped on the date", () => {
    insertTask(db, { id: "t1", status: "done", completed_at: at(12) });
    insertTask(db, { id: "t2", status: "dropped", dropped_at: at(13) });
    insertTask(db, { id: "t3", status: "done", completed_at: at(12, 0, 3) }); // previous day

    const summary = createContext(db).summary.forDate("2026-06-04");
    expect(summary.completedTaskCount).toBe(1);
    expect(summary.droppedTaskCount).toBe(1);
  });

  it("returns an empty-but-valid summary for a day with no activity", () => {
    const summary = createContext(db).summary.forDate("2026-06-04");
    expect(summary.totalFocusSeconds).toBe(0);
    expect(summary.byCategory).toEqual([]);
    expect(summary.totalFocusLabel).toBe("0m");
  });
});
