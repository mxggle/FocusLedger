import type { MemoryEntry } from "./types";

/** How many memories to inject into a turn's prompt. */
export const MEMORY_INJECT_K = 8;

function keywordScore(text: string, terms: string[]): number {
  const hay = text.toLowerCase();
  return terms.reduce((acc, term) => (term.length > 2 && hay.includes(term) ? acc + 1 : acc), 0);
}

/**
 * Rank active memories for the current user message, purely in TS (mirrors the
 * `tools.ts` keyword scan). Score = keyword overlap + pinned boost + usage boost
 * + slight recency. Pinned entries are always eligible. Returns ≤ k entries.
 */
export function rankMemories(all: MemoryEntry[], query: string, k: number): MemoryEntry[] {
  if (all.length === 0) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = all.map((entry) => {
    let score = keywordScore(entry.text, terms);
    if (entry.pinned) score += 100; // pinned always surfaces
    score += Math.min(entry.useCount, 5) * 0.5;
    score += entry.updatedAt > "2026" ? 0.1 : 0; // negligible recency nudge
    return { entry, score };
  });
  return scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((row) => row.entry);
}
