import type { SqliteDatabase } from "../db/database.js";
import type { TimeEntryRow, TimeEntryWithTaskRow } from "../db/types.js";

const WITH_TASK_SELECT = `SELECT
    time_entries.*,
    tasks.title AS task_title,
    tasks.estimated_minutes AS task_estimated_minutes,
    tasks.category_id AS category_id,
    categories.name AS category_name,
    categories.color AS category_color
  FROM time_entries
  INNER JOIN tasks ON tasks.id = time_entries.task_id
  LEFT JOIN categories ON categories.id = tasks.category_id`;

/** Reflection captured when a session stops. Missing/empty values keep the stored ones. */
export interface Reflection {
  note?: string | null;
  blocker?: string | null;
  next_action?: string | null;
  completion_rate?: number | null;
}

export interface TimeEntryRepository {
  /**
   * Entries that overlap `[startIso, endIso)`. An open entry (no `end_at`) is
   * treated as running until `nowIso`, matching the app's live behaviour.
   */
  listForRange(startIso: string, endIso: string, nowIso?: string): TimeEntryWithTaskRow[];
  listForTask(taskId: string): TimeEntryRow[];
  getById(id: string): TimeEntryRow | null;
  /** The single open entry (no `end_at`), if a session is running. */
  getActive(): TimeEntryRow | null;
  /** Most recent entry across all tasks — the continuation-window candidate. */
  getLatest(): TimeEntryRow | null;
  insert(row: TimeEntryRow): void;
  /** Reopen a closed entry so a quick pause/resume reads as one block. */
  reopen(id: string, nowIso: string): TimeEntryRow;
  /** Close an open entry, computing duration and merging the reflection. */
  close(id: string, endIso: string, reflection?: Reflection): TimeEntryRow;
  /** Merge reflection fields into an entry without touching its times. */
  applyReflection(id: string, reflection: Reflection): TimeEntryRow;
  delete(id: string): void;
}

function durationSeconds(startIso: string, endIso: string): number {
  return Math.max(0, Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
}

export function hasReflection(entry: Pick<TimeEntryRow, "note" | "blocker" | "next_action">): boolean {
  return Boolean(entry.note || entry.blocker || entry.next_action);
}

export function createTimeEntryRepository(db: SqliteDatabase): TimeEntryRepository {
  return {
    listForRange(startIso, endIso, nowIso = new Date().toISOString()) {
      const sql = `${WITH_TASK_SELECT}
         WHERE time_entries.start_at < ?
           AND COALESCE(time_entries.end_at, ?) > ?
         ORDER BY time_entries.start_at DESC`;
      return db.prepare(sql).all(endIso, nowIso, startIso) as TimeEntryWithTaskRow[];
    },

    listForTask(taskId) {
      return db
        .prepare("SELECT * FROM time_entries WHERE task_id = ? ORDER BY start_at ASC")
        .all(taskId) as TimeEntryRow[];
    },

    getById(id) {
      const row = db
        .prepare("SELECT * FROM time_entries WHERE id = ? LIMIT 1")
        .get(id) as TimeEntryRow | undefined;
      return row ?? null;
    },

    getActive() {
      const row = db
        .prepare("SELECT * FROM time_entries WHERE end_at IS NULL ORDER BY start_at DESC LIMIT 1")
        .get() as TimeEntryRow | undefined;
      return row ?? null;
    },

    getLatest() {
      const row = db
        .prepare("SELECT * FROM time_entries ORDER BY start_at DESC LIMIT 1")
        .get() as TimeEntryRow | undefined;
      return row ?? null;
    },

    insert(row) {
      db.prepare(
        `INSERT INTO time_entries (
          id, task_id, start_at, end_at, duration_seconds, note, blocker,
          next_action, completion_rate, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        row.id,
        row.task_id,
        row.start_at,
        row.end_at,
        row.duration_seconds,
        row.note,
        row.blocker,
        row.next_action,
        row.completion_rate,
        row.created_at,
        row.updated_at
      );
    },

    reopen(id, nowIso) {
      const existing = this.getById(id);
      if (!existing) {
        throw new Error(`Time entry not found: ${id}`);
      }
      db.prepare(
        "UPDATE time_entries SET end_at = NULL, duration_seconds = NULL, updated_at = ? WHERE id = ?"
      ).run(nowIso, id);
      return { ...existing, end_at: null, duration_seconds: null, updated_at: nowIso };
    },

    close(id, endIso, reflection = {}) {
      const existing = this.getById(id);
      if (!existing) {
        throw new Error(`Time entry not found: ${id}`);
      }
      if (existing.end_at) {
        return existing;
      }

      const next: TimeEntryRow = {
        ...existing,
        end_at: endIso,
        duration_seconds: durationSeconds(existing.start_at, endIso),
        note: reflection.note?.trim() || existing.note,
        blocker: reflection.blocker?.trim() || existing.blocker,
        next_action: reflection.next_action?.trim() || existing.next_action,
        completion_rate: reflection.completion_rate ?? existing.completion_rate,
        updated_at: endIso
      };
      db.prepare(
        `UPDATE time_entries SET
          end_at = ?, duration_seconds = ?, note = ?, blocker = ?, next_action = ?,
          completion_rate = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        next.end_at,
        next.duration_seconds,
        next.note,
        next.blocker,
        next.next_action,
        next.completion_rate,
        next.updated_at,
        id
      );
      return next;
    },

    applyReflection(id, reflection) {
      const existing = this.getById(id);
      if (!existing) {
        throw new Error(`Time entry not found: ${id}`);
      }
      const next: TimeEntryRow = {
        ...existing,
        note: reflection.note?.trim() || existing.note,
        blocker: reflection.blocker?.trim() || existing.blocker,
        next_action: reflection.next_action?.trim() || existing.next_action,
        completion_rate: reflection.completion_rate ?? existing.completion_rate,
        updated_at: new Date().toISOString()
      };
      db.prepare(
        `UPDATE time_entries SET
          note = ?, blocker = ?, next_action = ?, completion_rate = ?, updated_at = ?
         WHERE id = ?`
      ).run(next.note, next.blocker, next.next_action, next.completion_rate, next.updated_at, id);
      return next;
    },

    delete(id) {
      db.prepare("DELETE FROM time_entries WHERE id = ?").run(id);
    }
  };
}
