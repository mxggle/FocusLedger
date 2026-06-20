import { getDatabase } from "./client";
import type { ChatMessage, ProposedAction } from "../services/ai/assistant/types";
import type { ChatRole } from "../services/ai/providers";

type AssistantMessageRow = {
  id: string;
  role: string;
  content: string;
  actions: string | null;
  created_at: string;
};

function parseActions(value: string | null): ProposedAction[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as ProposedAction[]) : undefined;
  } catch {
    return undefined;
  }
}

function toChatMessage(row: AssistantMessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role as ChatRole,
    content: row.content,
    createdAt: row.created_at,
    actions: parseActions(row.actions)
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
        message.actions ? JSON.stringify(message.actions) : null,
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
  }
};
