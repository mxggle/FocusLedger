import { getDatabase } from "./client";
import type { RestSession, RestTrigger } from "../types";
import { endOfDateKey, startOfDateKey } from "../utils/date";
import { createId } from "../utils/id";

const REST_SELECT = `SELECT * FROM rest_sessions`;

// An open rest older than this is treated as abandoned (app left running, lid
// closed, etc.) and closed on startup rather than reopening the rest screen.
const ABANDONED_AFTER_SECONDS = 2 * 60 * 60;

function durationSeconds(startAt: string, endAt: string): number {
  return Math.max(0, Math.floor((new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000));
}

export const restSessionRepository = {
  /** Open a new rest session. Only one may be open at a time. */
  async open(trigger: RestTrigger = "manual", startedAt = new Date().toISOString()): Promise<RestSession> {
    const db = await getDatabase();
    const entry: RestSession = {
      id: createId("rest"),
      start_at: startedAt,
      end_at: null,
      duration_seconds: null,
      trigger,
      created_at: startedAt,
      updated_at: startedAt
    };

    await db.execute(
      `INSERT INTO rest_sessions (
        id, start_at, end_at, duration_seconds, trigger, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.id,
        entry.start_at,
        entry.end_at,
        entry.duration_seconds,
        entry.trigger,
        entry.created_at,
        entry.updated_at
      ]
    );

    return entry;
  },

  async getActive(): Promise<RestSession | null> {
    const db = await getDatabase();
    const rows = await db.select<RestSession[]>(
      `${REST_SELECT} WHERE end_at IS NULL ORDER BY start_at DESC LIMIT 1`
    );
    return rows[0] ?? null;
  },

  async getById(id: string): Promise<RestSession | null> {
    const db = await getDatabase();
    const rows = await db.select<RestSession[]>(`${REST_SELECT} WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ?? null;
  },

  async close(id: string, endedAt = new Date().toISOString()): Promise<RestSession | null> {
    const existing = await this.getById(id);
    if (!existing || existing.end_at) {
      return existing;
    }

    const db = await getDatabase();
    const next: RestSession = {
      ...existing,
      end_at: endedAt,
      duration_seconds: durationSeconds(existing.start_at, endedAt),
      updated_at: endedAt
    };

    await db.execute(
      `UPDATE rest_sessions SET end_at = $1, duration_seconds = $2, updated_at = $3 WHERE id = $4`,
      [next.end_at, next.duration_seconds, next.updated_at, id]
    );

    return next;
  },

  async deleteSession(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(`DELETE FROM rest_sessions WHERE id = $1`, [id]);
  },

  /**
   * Close any abandoned open rest sessions, then return the one still worth
   * resuming (open and recent). Mirrors timeEntryRepository.repairActiveEntries.
   */
  async repairActive(now = new Date().toISOString()): Promise<RestSession | null> {
    const db = await getDatabase();
    const open = await db.select<RestSession[]>(
      `${REST_SELECT} WHERE end_at IS NULL ORDER BY start_at DESC`
    );

    let resumable: RestSession | null = null;
    for (const session of open) {
      const elapsed = durationSeconds(session.start_at, now);
      if (resumable || elapsed > ABANDONED_AFTER_SECONDS) {
        await this.close(session.id, now);
      } else {
        resumable = session;
      }
    }
    return resumable;
  },

  async getForDate(date: string): Promise<RestSession[]> {
    const db = await getDatabase();
    const startIso = startOfDateKey(date).toISOString();
    const endIso = endOfDateKey(date).toISOString();
    const now = new Date().toISOString();
    return db.select<RestSession[]>(
      `${REST_SELECT}
       WHERE start_at < $2 AND COALESCE(end_at, $3) > $1
       ORDER BY start_at DESC`,
      [startIso, endIso, now]
    );
  }
};
