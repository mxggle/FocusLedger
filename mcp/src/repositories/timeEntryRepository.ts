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

export interface TimeEntryRepository {
  /**
   * Entries that overlap `[startIso, endIso)`. An open entry (no `end_at`) is
   * treated as running until `nowIso`, matching the app's live behaviour.
   */
  listForRange(startIso: string, endIso: string, nowIso?: string): TimeEntryWithTaskRow[];
  listForTask(taskId: string): TimeEntryRow[];
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
    }
  };
}
