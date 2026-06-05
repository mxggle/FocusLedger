import type { SqliteDatabase } from "../db/database.js";
import type { CategoryRow } from "../db/types.js";

export interface CategoryRepository {
  list(): CategoryRow[];
}

export function createCategoryRepository(db: SqliteDatabase): CategoryRepository {
  return {
    list(): CategoryRow[] {
      return db.prepare("SELECT * FROM categories ORDER BY name ASC").all() as CategoryRow[];
    }
  };
}
