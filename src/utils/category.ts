import type { Category } from "../types";

/** Fallback color when a category has no color set or cannot be resolved. */
export const FALLBACK_CATEGORY_COLOR = "hsl(var(--muted-foreground))";

export function findCategory(
  categories: Category[],
  id: string | null | undefined
): Category | undefined {
  return id ? categories.find((category) => category.id === id) : undefined;
}

export function resolveCategoryColor(color: string | null | undefined): string {
  return color ?? FALLBACK_CATEGORY_COLOR;
}
