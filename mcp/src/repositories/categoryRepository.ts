import type { SqliteDatabase } from "../db/database.js";
import type { CategoryRow } from "../db/types.js";

export interface CategoryRepository {
  list(): CategoryRow[];
  getById(id: string): CategoryRow | null;
}

export function createCategoryRepository(db: SqliteDatabase): CategoryRepository {
  return {
    list(): CategoryRow[] {
      return db.prepare("SELECT * FROM categories ORDER BY name ASC").all() as CategoryRow[];
    },

    getById(id: string): CategoryRow | null {
      const row = db
        .prepare("SELECT * FROM categories WHERE id = ? LIMIT 1")
        .get(id) as CategoryRow | undefined;
      return row ?? null;
    }
  };
}
