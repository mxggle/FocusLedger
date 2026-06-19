import type { Category } from "../types";

/** Resolve a category name (case-insensitive, trimmed) to an existing id, or null. */
export function findCategoryIdByName(categories: Category[], name: string): string | null {
  const needle = name.trim().toLowerCase();
  if (needle.length === 0) return null;
  const match = categories.find((category) => category.name.trim().toLowerCase() === needle);
  return match ? match.id : null;
}
