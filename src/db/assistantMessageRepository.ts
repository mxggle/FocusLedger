import { getDatabase } from "./client";
import type { ChatMessage } from "../services/ai/assistant/types";
import type { ToolCallRecord } from "../services/ai/assistant/agentTools/types";
import type { ChatRole } from "../services/ai/providers";

type AssistantMessageRow = {
  id: string;
  role: string;
  content: string;
  actions: string | null;
  created_at: string;
};

function parseToolCalls(value: string | null): Pick<ChatMessage, "toolCalls"> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return {};
    const first = parsed[0] as Record<string, unknown> | undefined;
    if (first && typeof first.name === "string" && "args" in first) {
      return { toolCalls: parsed as ToolCallRecord[] };
    }
    return {};
  } catch {
    return {};
  }
}

function toChatMessage(row: AssistantMessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role as ChatRole,
    content: row.content,
    createdAt: row.created_at,
    ...parseToolCalls(row.actions)
  };
}

export const assistantMessageRepository = {
  async append(message: ChatMessage): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO assistant_messages (id, role, content, actions, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         content = excluded.content,
         actions = excluded.actions`,
      [
        message.id,
        message.role,
        message.content,
        message.toolCalls ? JSON.stringify(message.toolCalls) : null,
        message.createdAt
      ]
    );
  },

  /** The most recent `limit` messages, returned oldest-first for display. */
  async getRecent(limit: number): Promise<ChatMessage[]> {
    const db = await getDatabase();
    const rows = await db.select<AssistantMessageRow[]>(
      "SELECT * FROM assistant_messages ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return rows.map(toChatMessage).reverse();
  },

  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM assistant_messages");
  },

  /** Delete a single message by id. */
  async deleteOne(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM assistant_messages WHERE id = $1", [id]);
  },

  /** Delete every message created after the given message (by created_at). */
  async deleteAfter(id: string): Promise<void> {
    const db = await getDatabase();
    const rows = await db.select<{ created_at: string }[]>(
      "SELECT created_at FROM assistant_messages WHERE id = $1",
      [id]
    );
    if (rows.length === 0) return;
    await db.execute(
      "DELETE FROM assistant_messages WHERE created_at > $1",
      [rows[0].created_at]
    );
  }
};
