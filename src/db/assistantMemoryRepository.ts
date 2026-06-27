import { getDatabase } from "./client";
import type { MemoryEntry, MemoryKind } from "../services/ai/assistant/memory/types";

type MemoryRow = {
  id: string; kind: string; text: string; pinned: number; status: string;
  source_message_id: string | null; use_count: number; last_used_at: string | null;
  created_at: string; updated_at: string;
};

function toEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id, kind: row.kind as MemoryKind, text: row.text, pinned: row.pinned === 1,
    status: row.status === "archived" ? "archived" : "active",
    sourceMessageId: row.source_message_id, useCount: row.use_count, lastUsedAt: row.last_used_at,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export const assistantMemoryRepository = {
  async getActive(): Promise<MemoryEntry[]> {
    const db = await getDatabase();
    const rows = await db.select<MemoryRow[]>(
      "SELECT * FROM assistant_memory WHERE status = 'active' ORDER BY updated_at DESC"
    );
    return rows.map(toEntry);
  },

  async getAll(): Promise<MemoryEntry[]> {
    const db = await getDatabase();
    const rows = await db.select<MemoryRow[]>("SELECT * FROM assistant_memory ORDER BY updated_at DESC");
    return rows.map(toEntry);
  },

  async add(entry: MemoryEntry): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO assistant_memory
         (id, kind, text, pinned, status, source_message_id, use_count, last_used_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [entry.id, entry.kind, entry.text, entry.pinned ? 1 : 0, entry.status, entry.sourceMessageId,
       entry.useCount, entry.lastUsedAt, entry.createdAt, entry.updatedAt]
    );
  },

  async updateText(id: string, text: string, kind: MemoryKind, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_memory SET text = $1, kind = $2, updated_at = $3 WHERE id = $4",
      [text, kind, updatedAt, id]
    );
  },

  async bumpUsage(id: string, useCount: number, lastUsedAt: string, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_memory SET use_count = $1, last_used_at = $2, updated_at = $3 WHERE id = $4",
      [useCount, lastUsedAt, updatedAt, id]
    );
  },

  async archive(id: string, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_memory SET status = 'archived', updated_at = $1 WHERE id = $2",
      [updatedAt, id]
    );
  },

  async restore(id: string, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_memory SET status = 'active', updated_at = $1 WHERE id = $2",
      [updatedAt, id]
    );
  },

  async setPinned(id: string, pinned: boolean, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_memory SET pinned = $1, updated_at = $2 WHERE id = $3",
      [pinned ? 1 : 0, updatedAt, id]
    );
  }
};
