import { getDatabase } from "./client";
import type { Category } from "../types";

export const categoryRepository = {
  async getAll(): Promise<Category[]> {
    const db = await getDatabase();
    return db.select<Category[]>("SELECT * FROM categories ORDER BY name ASC");
  },

  async getById(id: string): Promise<Category | null> {
    const db = await getDatabase();
    const rows = await db.select<Category[]>("SELECT * FROM categories WHERE id = $1 LIMIT 1", [id]);
    return rows[0] ?? null;
  }
};
