import { getDatabase } from "./client";
import type { AssistantSession } from "./types";

type AssistantSessionRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

function toSession(row: AssistantSessionRow): AssistantSession {
  return {
    id: row.id,
    title: row.title ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const assistantSessionRepository = {
  async create(session: { id: string; title?: string; createdAt: string }): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO assistant_sessions (id, title, created_at, updated_at)
       VALUES ($1, $2, $3, $3)`,
      [session.id, session.title ?? "", session.createdAt]
    );
  },

  /** All sessions, most-recently-active first. */
  async list(): Promise<AssistantSession[]> {
    const db = await getDatabase();
    const rows = await db.select<AssistantSessionRow[]>(
      "SELECT * FROM assistant_sessions ORDER BY updated_at DESC"
    );
    return rows.map(toSession);
  },

  async rename(id: string, title: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("UPDATE assistant_sessions SET title = $1 WHERE id = $2", [title, id]);
  },

  /** Set the title only when it is still empty (first user message wins). */
  async setTitleIfEmpty(id: string, title: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_sessions SET title = $1 WHERE id = $2 AND (title IS NULL OR title = '')",
      [title, id]
    );
  },

  /** Bump the activity timestamp so the session sorts to the top of the list. */
  async touch(id: string, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("UPDATE assistant_sessions SET updated_at = $1 WHERE id = $2", [updatedAt, id]);
  },

  /** Delete a session and all of its messages (no FK cascade in the schema). */
  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM assistant_messages WHERE session_id = $1", [id]);
    await db.execute("DELETE FROM assistant_sessions WHERE id = $1", [id]);
  }
};
