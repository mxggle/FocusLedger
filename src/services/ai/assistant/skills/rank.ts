import type { AssistantSkill } from "./types";

/** How many skills to inject into a turn's prompt. */
export const SKILL_INJECT_K = 5;

function keywordScore(text: string, terms: string[]): number {
  const hay = text.toLowerCase();
  return terms.reduce((acc, term) => (term.length > 2 && hay.includes(term) ? acc + 1 : acc), 0);
}

/**
 * Rank active (non-archived) skills for the current user message, purely in TS.
 * Score = keyword overlap across name+trigger+steps + pinned boost + usage boost
 * + slight recency. Pinned entries are always eligible. Returns ≤ k entries.
 */
export function rankSkills(skills: AssistantSkill[], message: string, k: number): AssistantSkill[] {
  if (skills.length === 0) return [];
  const active = skills.filter((s) => !s.archived);
  if (active.length === 0) return [];

  const terms = message.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = active.map((s) => {
    const searchText = `${s.name} ${s.trigger} ${s.steps}`;
    let score = keywordScore(searchText, terms);
    if (s.pinned) score += 100; // pinned always surfaces
    score += Math.min(s.useCount, 5) * 0.5;
    score += s.updatedAt > "2026" ? 0.1 : 0; // negligible recency nudge
    return { skill: s, score };
  });

  return scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((row) => row.skill);
}
