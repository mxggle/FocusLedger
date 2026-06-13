import { getDatabase } from "./client";
import type { DailyDebrief } from "../types";

export const debriefRepository = {
  async getForDate(date: string): Promise<DailyDebrief | null> {
    const db = await getDatabase();
    const rows = await db.select<DailyDebrief[]>(
      "SELECT * FROM daily_debriefs WHERE date = $1",
      [date]
    );
    return rows[0] ?? null;
  },

  async save(input: {
    date: string;
    content: string;
    provider: string;
    model: string;
    inputHash: string;
  }): Promise<DailyDebrief> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO daily_debriefs (date, content, provider, model, input_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT(date) DO UPDATE SET
         content = excluded.content,
         provider = excluded.provider,
         model = excluded.model,
         input_hash = excluded.input_hash,
         updated_at = excluded.updated_at`,
      [input.date, input.content, input.provider, input.model, input.inputHash, now]
    );
    const saved = await this.getForDate(input.date);
    if (!saved) {
      throw new Error("Debrief could not be saved");
    }
    return saved;
  }
};
