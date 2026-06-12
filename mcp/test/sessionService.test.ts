import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database as SqliteDatabase } from "better-sqlite3";
import type { TaskRow, TimeEntryRow } from "../src/db/types.js";
import { createTaskRepository } from "../src/repositories/taskRepository.js";
import { createTimeEntryRepository } from "../src/repositories/timeEntryRepository.js";
import { createSessionService, type SessionService } from "../src/services/sessionService.js";
import { createTestDb, insertEntry, insertTask } from "./helpers/db.js";

const NOW = new Date("2026-06-11T12:00:00.000Z");

function task(db: SqliteDatabase, id: string): TaskRow {
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow;
}

function entries(db: SqliteDatabase): TimeEntryRow[] {
  return db.prepare("SELECT * FROM time_entries ORDER BY start_at ASC").all() as TimeEntryRow[];
}

function secondsAgo(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe("sessionService", () => {
  let db: SqliteDatabase;
  let session: SessionService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    db = createTestDb();
    insertTask(db, { id: "a", title: "Task A" });
    insertTask(db, { id: "b", title: "Task B" });
    const tasks = createTaskRepository(db);
    const timeEntries = createTimeEntryRepository(db);
    session = createSessionService({ db, tasks, timeEntries });
    return () => vi.useRealTimers();
  });

  it("start opens an entry and marks the task doing", () => {
    const result = session.start("a");

    expect(result.entry.task_id).toBe("a");
    expect(result.entry.end_at).toBeNull();
    expect(result.pausedTaskId).toBeNull();
    expect(task(db, "a").status).toBe("doing");
  });

  it("starting the running task again is a no-op", () => {
    const first = session.start("a");
    const second = session.start("a");

    expect(second.entry.id).toBe(first.entry.id);
    expect(entries(db)).toHaveLength(1);
  });

  it("start auto-pauses another running task", () => {
    insertEntry(db, { id: "e-a", task_id: "a", start_at: secondsAgo(600), end_at: null });
    db.prepare("UPDATE tasks SET status = 'doing' WHERE id = 'a'").run();

    const result = session.start("b");

    expect(result.pausedTaskId).toBe("a");
    expect(task(db, "a").status).toBe("paused");
    expect(task(db, "b").status).toBe("doing");
    const closed = entries(db).find((e) => e.id === "e-a");
    expect(closed?.end_at).not.toBeNull();
    expect(closed?.duration_seconds).toBe(600);
  });

  it("auto-pause discards a trivial block from the switched-away task", () => {
    insertEntry(db, { id: "e-a", task_id: "a", start_at: secondsAgo(5), end_at: null });

    const result = session.start("b");

    expect(result.pausedTaskId).toBe("a");
    expect(entries(db).map((e) => e.task_id)).toEqual(["b"]);
  });

  it("restarting within the continuation window reopens the previous block", () => {
    insertEntry(db, {
      id: "e-a",
      task_id: "a",
      start_at: secondsAgo(700),
      end_at: secondsAgo(60),
      duration_seconds: 640
    });

    const result = session.start("a");

    expect(result.resumedPreviousBlock).toBe(true);
    expect(result.entry.id).toBe("e-a");
    expect(result.entry.end_at).toBeNull();
    expect(entries(db)).toHaveLength(1);
  });

  it("restarting after the window opens a new block", () => {
    insertEntry(db, {
      id: "e-a",
      task_id: "a",
      start_at: secondsAgo(900),
      end_at: secondsAgo(400),
      duration_seconds: 500
    });

    const result = session.start("a");

    expect(result.resumedPreviousBlock).toBe(false);
    expect(entries(db)).toHaveLength(2);
  });

  it("a block with a stop-note is never reopened", () => {
    insertEntry(db, {
      id: "e-a",
      task_id: "a",
      start_at: secondsAgo(700),
      end_at: secondsAgo(60),
      duration_seconds: 640,
      note: "wrote the intro"
    });

    const result = session.start("a");

    expect(result.resumedPreviousBlock).toBe(false);
    expect(entries(db)).toHaveLength(2);
  });

  it("pauseActive closes the running entry and pauses its task", () => {
    insertEntry(db, { id: "e-a", task_id: "a", start_at: secondsAgo(300), end_at: null });
    db.prepare("UPDATE tasks SET status = 'doing' WHERE id = 'a'").run();

    const result = session.pauseActive();

    expect(result.pausedTaskId).toBe("a");
    expect(result.entryDiscarded).toBe(false);
    expect(task(db, "a").status).toBe("paused");
  });

  it("pauseActive is a safe no-op when nothing runs", () => {
    expect(session.pauseActive()).toEqual({ pausedTaskId: null, entryDiscarded: false });
  });

  it("complete stops the running session, saves the reflection, defaults rate to 100", () => {
    insertEntry(db, { id: "e-a", task_id: "a", start_at: secondsAgo(1800), end_at: null });
    db.prepare("UPDATE tasks SET status = 'doing' WHERE id = 'a'").run();

    const result = session.complete("a", { note: "shipped it", next_action: "announce" });

    expect(result.entry?.note).toBe("shipped it");
    expect(result.entry?.next_action).toBe("announce");
    expect(result.entry?.completion_rate).toBe(100);
    expect(result.entry?.end_at).toBe(NOW.toISOString());
    const done = task(db, "a");
    expect(done.status).toBe("done");
    expect(done.completed_at).toBe(NOW.toISOString());
  });

  it("complete on a paused task attaches the reflection to its latest block", () => {
    insertEntry(db, {
      id: "e-old",
      task_id: "a",
      start_at: secondsAgo(7200),
      end_at: secondsAgo(5400),
      duration_seconds: 1800
    });

    const result = session.complete("a", { note: "was already done" });

    expect(result.entry?.id).toBe("e-old");
    expect(result.entry?.note).toBe("was already done");
    expect(task(db, "a").status).toBe("done");
  });

  it("drop closes the session without forcing a completion rate", () => {
    insertEntry(db, { id: "e-a", task_id: "a", start_at: secondsAgo(120), end_at: null });

    const result = session.drop("a", { blocker: "scope exploded" });

    expect(result.entry?.blocker).toBe("scope exploded");
    expect(result.entry?.completion_rate).toBeNull();
    const dropped = task(db, "a");
    expect(dropped.status).toBe("dropped");
    expect(dropped.dropped_at).toBe(NOW.toISOString());
    expect(dropped.completed_at).toBeNull();
  });

  it("does not touch another task's running session on complete", () => {
    insertEntry(db, { id: "e-b", task_id: "b", start_at: secondsAgo(300), end_at: null });

    session.complete("a");

    const running = entries(db).find((e) => e.id === "e-b");
    expect(running?.end_at).toBeNull();
  });
});
