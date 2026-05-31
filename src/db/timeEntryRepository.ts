import { getDatabase } from "./client";
import type { StopSessionInput, TimeEntry, TimeEntryWithTask } from "../types";
import { endOfDateKey, startOfDateKey } from "../utils/date";
import { createId } from "../utils/id";

const TIME_ENTRY_SELECT = `SELECT * FROM time_entries`;

function durationSeconds(startAt: string, endAt: string): number {
  return Math.max(0, Math.floor((new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000));
}

export const timeEntryRepository = {
  async createEntry(taskId: string, startedAt = new Date().toISOString()): Promise<TimeEntry> {
    const db = await getDatabase();
    const entry: TimeEntry = {
      id: createId("entry"),
      task_id: taskId,
      start_at: startedAt,
      end_at: null,
      duration_seconds: null,
      note: null,
      blocker: null,
      next_action: null,
      completion_rate: null,
      created_at: startedAt,
      updated_at: startedAt
    };

    await db.execute(
      `INSERT INTO time_entries (
        id, task_id, start_at, end_at, duration_seconds, note, blocker,
        next_action, completion_rate, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.id,
        entry.task_id,
        entry.start_at,
        entry.end_at,
        entry.duration_seconds,
        entry.note,
        entry.blocker,
        entry.next_action,
        entry.completion_rate,
        entry.created_at,
        entry.updated_at
      ]
    );

    return entry;
  },

  async getActiveEntry(): Promise<TimeEntry | null> {
    const db = await getDatabase();
    const rows = await db.select<TimeEntry[]>(
      `${TIME_ENTRY_SELECT} WHERE end_at IS NULL ORDER BY start_at DESC LIMIT 1`
    );
    return rows[0] ?? null;
  },

  async repairActiveEntries(now = new Date().toISOString()): Promise<TimeEntry | null> {
    const db = await getDatabase();
    const activeEntries = await db.select<TimeEntry[]>(
      `${TIME_ENTRY_SELECT} WHERE end_at IS NULL ORDER BY start_at DESC`
    );

    const [latest, ...staleEntries] = activeEntries;
    for (const staleEntry of staleEntries) {
      console.warn("Closing stale active time entry", staleEntry.id);
      await this.closeEntry(staleEntry.id, now);
    }

    return latest ?? null;
  },

  async closeEntry(id: string, endedAt = new Date().toISOString(), input: StopSessionInput = {}): Promise<TimeEntry> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Time entry not found");
    }

    if (existing.end_at) {
      return existing;
    }

    const db = await getDatabase();
    const next: TimeEntry = {
      ...existing,
      end_at: endedAt,
      duration_seconds: durationSeconds(existing.start_at, endedAt),
      note: input.note?.trim() || existing.note,
      blocker: input.blocker?.trim() || existing.blocker,
      next_action: input.next_action?.trim() || existing.next_action,
      completion_rate: input.completion_rate ?? existing.completion_rate,
      updated_at: endedAt
    };

    await db.execute(
      `UPDATE time_entries SET
        end_at = $1,
        duration_seconds = $2,
        note = $3,
        blocker = $4,
        next_action = $5,
        completion_rate = $6,
        updated_at = $7
       WHERE id = $8`,
      [
        next.end_at,
        next.duration_seconds,
        next.note,
        next.blocker,
        next.next_action,
        next.completion_rate,
        next.updated_at,
        id
      ]
    );

    return next;
  },

  async getById(id: string): Promise<TimeEntry | null> {
    const db = await getDatabase();
    const rows = await db.select<TimeEntry[]>(`${TIME_ENTRY_SELECT} WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ?? null;
  },

  async getEntriesForTask(taskId: string): Promise<TimeEntry[]> {
    const db = await getDatabase();
    return db.select<TimeEntry[]>(`${TIME_ENTRY_SELECT} WHERE task_id = $1 ORDER BY start_at ASC`, [taskId]);
  },

  async getTaskDurationSeconds(taskId: string, now = new Date()): Promise<number> {
    const entries = await this.getEntriesForTask(taskId);
    return entries.reduce((sum, entry) => {
      if (entry.duration_seconds !== null) {
        return sum + entry.duration_seconds;
      }

      return sum + Math.max(0, Math.floor((now.getTime() - new Date(entry.start_at).getTime()) / 1000));
    }, 0);
  },

  async getEntriesForDate(date: string, now = new Date().toISOString()): Promise<TimeEntryWithTask[]> {
    return this.getEntriesForRange(startOfDateKey(date).toISOString(), endOfDateKey(date).toISOString(), now);
  },

  async getEntriesForRange(startIso: string, endIso: string, now = new Date().toISOString()): Promise<TimeEntryWithTask[]> {
    const db = await getDatabase();
    return db.select<TimeEntryWithTask[]>(
      `SELECT
        time_entries.*,
        tasks.title AS task_title,
        tasks.category_id AS category_id,
        categories.name AS category_name,
        categories.color AS category_color
       FROM time_entries
       INNER JOIN tasks ON tasks.id = time_entries.task_id
       LEFT JOIN categories ON categories.id = tasks.category_id
       WHERE time_entries.start_at < $2
         AND COALESCE(time_entries.end_at, $3) > $1
       ORDER BY time_entries.start_at DESC`,
      [startIso, endIso, now]
    );
  }
};
