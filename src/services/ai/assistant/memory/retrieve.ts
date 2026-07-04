import { countTermHits, extractTerms } from "../normalizeKey";
import type { MemoryEntry } from "./types";

/** How many memories to inject into a turn's prompt. */
export const MEMORY_INJECT_K = 8;

/**
 * Rank active memories for the current user message, purely in TS (mirrors the
 * `tools.ts` keyword scan). Score = keyword overlap (CJK-aware) + pinned boost
 * + usage boost + slight recency. Pinned entries are always eligible. Returns ≤ k entries.
 */
export function rankMemories(all: MemoryEntry[], query: string, k: number): MemoryEntry[] {
  if (all.length === 0) return [];
  const terms = extractTerms(query);
  const scored = all.map((entry) => {
    let score = countTermHits(entry.text, terms);
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
