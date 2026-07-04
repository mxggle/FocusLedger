/**
 * Normalize free text into a dedup/equality key.
 *
 * Unicode-aware on purpose: an earlier version stripped everything outside
 * `[a-z0-9 ]`, which erased CJK (and every other non-Latin script) to the empty
 * string — so all non-Latin memories/skills collapsed onto one bogus key and
 * deduped into each other. We keep any Unicode letter or number, fold case, and
 * apply NFKC so full/half-width and compatibility forms compare equal.
 */
export function normalizeKey(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CJK_RUN = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]+/gu;
const WORD_RUN = /[\p{L}\p{N}]+/gu;

/**
 * Split free text into matchable terms, CJK-aware. Whitespace tokenization is
 * useless for Chinese/Japanese ("剩下的时间" is one "word" to a splitter), and a
 * `length > 2` filter silently drops most CJK words entirely — so CJK runs are
 * expanded into character bigrams (plus the lone char for 1-char runs), while
 * Latin/digit runs keep the old ≥3-char filter. Falls back to the raw runs when
 * filtering would leave nothing (e.g. the query is a single short word like "go").
 */
export function extractTerms(text: string): string[] {
  const norm = normalizeKey(text);
  if (norm.length === 0) return [];

  const cjkRuns = norm.match(CJK_RUN) ?? [];
  const nonCjk = norm.replace(CJK_RUN, " ");
  const wordRuns = nonCjk.match(WORD_RUN) ?? [];

  const terms: string[] = [];
  for (const run of cjkRuns) {
    const chars = Array.from(run);
    if (chars.length === 1) {
      terms.push(run);
    } else {
      for (let i = 0; i < chars.length - 1; i++) terms.push(chars[i] + chars[i + 1]);
    }
  }
  for (const word of wordRuns) {
    if (word.length > 2) terms.push(word);
  }
  if (terms.length > 0) return [...new Set(terms)];

  // Nothing survived the filters — match on whatever runs exist.
  return [...new Set([...cjkRuns, ...wordRuns])];
}

/** Substring-match `terms` against normalized text; returns the number of hits. */
export function countTermHits(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const hay = normalizeKey(text);
  return terms.reduce((acc, term) => (hay.includes(term) ? acc + 1 : acc), 0);
}
