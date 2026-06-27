/** Max characters kept for an auto-derived session title before ellipsis. */
const TITLE_MAX = 48;

/**
 * Derive a short, deterministic session title from a user message. Takes the
 * first non-empty line, collapses whitespace, and truncates. Returns "" when
 * there is nothing usable (callers fall back to a placeholder).
 */
export function deriveSessionTitle(content: string | null | undefined): string {
  if (!content) return "";
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "";
  const collapsed = firstLine.replace(/\s+/g, " ").trim();
  if (collapsed.length <= TITLE_MAX) return collapsed;
  return `${collapsed.slice(0, TITLE_MAX).trimEnd()}…`;
}
