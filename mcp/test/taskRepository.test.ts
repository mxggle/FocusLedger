import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { createTaskRepository } from "../src/repositories/taskRepository.js";
import { createTestDb, insertCategory, insertTask } from "./helpers/db.js";

describe("taskRepository", () => {
  let db: SqliteDatabase;
  let originalTimezone: string | undefined;

  beforeEach(() => {
    originalTimezone = process.env.TZ;
    db = createTestDb();
    insertCategory(db, { id: "dev", name: "Development", color: "#7c3aed" });
    insertCategory(db, { id: "life", name: "Life", color: "#ea580c" });

    insertTask(db, { id: "t1", status: "todo", priority: "low", due_date: "2026-06-04", category_id: "dev" });
    insertTask(db, { id: "t2", status: "doing", priority: "high", due_date: "2026-06-01", category_id: "dev" });
    insertTask(db, { id: "t3", status: "done", priority: "medium", due_date: "2026-06-04", category_id: "life" });
    insertTask(db, { id: "t4", status: "todo", priority: "medium", due_date: null, category_id: "life" });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  });

  it("lists all tasks ordered by priority", () => {
    const repo = createTaskRepository(db);
    const tasks = repo.list({ scope: "all" });
    expect(tasks.map((t) => t.id)).toContain("t2");
    expect(tasks[0].priority).toBe("high"); // high sorts first
  });

  it("filters by status", () => {
    const repo = createTaskRepository(db);
    const tasks = repo.list({ scope: "all", status: ["todo"] });
    expect(tasks.map((t) => t.id).sort()).toEqual(["t1", "t4"]);
  });

  it("filters by category", () => {
    const repo = createTaskRepository(db);
    const tasks = repo.list({ scope: "all", categoryId: "life" });
    expect(tasks.map((t) => t.id).sort()).toEqual(["t3", "t4"]);
  });

  it("returns backlog tasks (no due date, not finished)", () => {
    const repo = createTaskRepository(db);
    const tasks = repo.list({ scope: "backlog" });
    expect(tasks.map((t) => t.id)).toEqual(["t4"]);
  });

  it("returns today tasks including overdue and in-progress, excluding done", () => {
    const repo = createTaskRepository(db);
    const tasks = repo.list({ scope: "today", dueOn: "2026-06-04" });
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain("t1"); // due today
    expect(ids).toContain("t2"); // overdue + doing
    expect(ids).not.toContain("t3"); // done
    expect(ids).not.toContain("t4"); // backlog, no due date
    expect(tasks[0].id).toBe("t2"); // in-progress sorts first
  });

  it("defaults today scope to the local date", () => {
    process.env.TZ = "Asia/Tokyo";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T15:30:00.000Z")); // 2026-06-05 locally
    insertTask(db, { id: "t5", status: "todo", priority: "medium", due_date: "2026-06-05" });

    const repo = createTaskRepository(db);
    const tasks = repo.list({ scope: "today" });

    expect(tasks.map((t) => t.id)).toContain("t5");
  });

  it("orders today tasks like the desktop app", () => {
    insertTask(db, {
      id: "p1",
      status: "todo",
      priority: "medium",
      due_date: "2026-06-04",
      planned_start_time: "10:00",
      sort_order: 2
    });
    insertTask(db, {
      id: "p2",
      status: "todo",
      priority: "medium",
      due_date: "2026-06-04",
      planned_start_time: "09:00",
      sort_order: 3
    });
    insertTask(db, {
      id: "p3",
      status: "todo",
      priority: "medium",
      due_date: "2026-06-04",
      planned_start_time: null,
      sort_order: 1
    });

    const repo = createTaskRepository(db);
    const ordered = repo
      .list({ scope: "today", dueOn: "2026-06-04" })
      .map((t) => t.id)
      .filter((id) => id.startsWith("p"));

    expect(ordered).toEqual(["p2", "p1", "p3"]);
  });

  it("respects the limit", () => {
    const repo = createTaskRepository(db);
    expect(repo.list({ scope: "all", limit: 2 })).toHaveLength(2);
  });

  it("gets a task by id and returns null for unknown ids", () => {
    const repo = createTaskRepository(db);
    expect(repo.getById("t1")?.id).toBe("t1");
    expect(repo.getById("nope")).toBeNull();
  });
});
