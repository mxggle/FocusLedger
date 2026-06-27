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
