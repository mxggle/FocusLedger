import { getDatabase } from "./client";
import type { Category, CreateCategoryInput, UpdateCategoryInput } from "../types";
import { createId } from "../utils/id";

// The "inbox" category is the system fallback used by createTask and the UI when
// a task has no resolvable category. It must always exist and cannot be deleted.
export const FALLBACK_CATEGORY_ID = "inbox";

export const categoryRepository = {
  async getAll(): Promise<Category[]> {
    const db = await getDatabase();
    return db.select<Category[]>("SELECT * FROM categories ORDER BY name ASC");
  },

  async getById(id: string): Promise<Category | null> {
    const db = await getDatabase();
    const rows = await db.select<Category[]>("SELECT * FROM categories WHERE id = $1 LIMIT 1", [id]);
    return rows[0] ?? null;
  },

  async create(input: CreateCategoryInput): Promise<Category> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const name = input.name.trim();
    if (!name) {
      throw new Error("Category name is required");
    }
    await assertNameAvailable(name);

    const category: Category = {
      id: createId("cat"),
      name,
      color: input.color ?? null,
      created_at: now,
      updated_at: now
    };

    await db.execute(
      `INSERT INTO categories (id, name, color, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [category.id, category.name, category.color, category.created_at, category.updated_at]
    );

    return category;
  },

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Category not found");
    }

    const name = input.name !== undefined ? input.name.trim() : existing.name;
    if (!name) {
      throw new Error("Category name is required");
    }
    if (name.toLowerCase() !== existing.name.toLowerCase()) {
      await assertNameAvailable(name, id);
    }

    const next: Category = {
      ...existing,
      name,
      color: input.color !== undefined ? input.color : existing.color,
      updated_at: new Date().toISOString()
    };

    const db = await getDatabase();
    await db.execute(
      `UPDATE categories SET name = $1, color = $2, updated_at = $3 WHERE id = $4`,
      [next.name, next.color, next.updated_at, id]
    );

    return next;
  },

  /**
   * Deletes a category, reassigning any tasks/templates that reference it to the
   * fallback "inbox" category so no records are orphaned.
   */
  async delete(id: string): Promise<void> {
    if (id === FALLBACK_CATEGORY_ID) {
      throw new Error("The Inbox category cannot be deleted");
    }
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Category not found");
    }

    const db = await getDatabase();
    await db.execute("UPDATE tasks SET category_id = $1 WHERE category_id = $2", [FALLBACK_CATEGORY_ID, id]);
    await db.execute("UPDATE task_templates SET category_id = $1 WHERE category_id = $2", [FALLBACK_CATEGORY_ID, id]);
    await db.execute("DELETE FROM categories WHERE id = $1", [id]);
  },

  /** Number of tasks + templates currently assigned to this category. */
  async getUsageCount(id: string): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<Array<{ total: number }>>(
      `SELECT
        (SELECT COUNT(*) FROM tasks WHERE category_id = $1)
        + (SELECT COUNT(*) FROM task_templates WHERE category_id = $1) AS total`,
      [id]
    );
    return rows[0]?.total ?? 0;
  }
};

async function assertNameAvailable(name: string, excludeId?: string): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ id: string }>>(
    "SELECT id FROM categories WHERE LOWER(name) = LOWER($1)",
    [name]
  );
  const clash = rows.some((row) => row.id !== excludeId);
  if (clash) {
    throw new Error(`A category named "${name}" already exists`);
  }
}
