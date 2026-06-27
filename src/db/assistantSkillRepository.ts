import { getDatabase } from "./client";
import type { AssistantSkill } from "../services/ai/assistant/skills/types";

type SkillRow = {
  id: string;
  name: string;
  trigger: string;
  steps: string;
  pinned: number;
  archived: number;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

function toSkill(row: SkillRow): AssistantSkill {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    steps: row.steps,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const assistantSkillRepository = {
  async getActive(): Promise<AssistantSkill[]> {
    const db = await getDatabase();
    const rows = await db.select<SkillRow[]>(
      "SELECT * FROM assistant_skills WHERE archived = 0 ORDER BY updated_at DESC"
    );
    return rows.map(toSkill);
  },

  async getAll(): Promise<AssistantSkill[]> {
    const db = await getDatabase();
    const rows = await db.select<SkillRow[]>("SELECT * FROM assistant_skills ORDER BY updated_at DESC");
    return rows.map(toSkill);
  },

  async add(skill: AssistantSkill): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO assistant_skills
         (id, name, trigger, steps, pinned, archived, use_count, last_used_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        skill.id,
        skill.name,
        skill.trigger,
        skill.steps,
        skill.pinned ? 1 : 0,
        skill.archived ? 1 : 0,
        skill.useCount,
        skill.lastUsedAt,
        skill.createdAt,
        skill.updatedAt
      ]
    );
  },

  async update(id: string, fields: Pick<AssistantSkill, "name" | "trigger" | "steps">, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_skills SET name = $1, trigger = $2, steps = $3, updated_at = $4 WHERE id = $5",
      [fields.name, fields.trigger, fields.steps, updatedAt, id]
    );
  },

  async bumpUsage(id: string, useCount: number, lastUsedAt: string, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_skills SET use_count = $1, last_used_at = $2, updated_at = $3 WHERE id = $4",
      [useCount, lastUsedAt, updatedAt, id]
    );
  },

  async archive(id: string, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("UPDATE assistant_skills SET archived = 1, updated_at = $1 WHERE id = $2", [updatedAt, id]);
  },

  async restore(id: string, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("UPDATE assistant_skills SET archived = 0, updated_at = $1 WHERE id = $2", [updatedAt, id]);
  },

  async setPinned(id: string, pinned: boolean, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("UPDATE assistant_skills SET pinned = $1, updated_at = $2 WHERE id = $3", [
      pinned ? 1 : 0,
      updatedAt,
      id
    ]);
  }
};
