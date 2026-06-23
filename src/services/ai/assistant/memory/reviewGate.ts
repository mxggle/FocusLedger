const TRIVIAL = new Set([
  "ok", "okay", "k", "kk", "thanks", "thank you", "thx", "ty", "great",
  "cool", "nice", "yes", "no", "yep", "nope", "sure", "done", "got it"
]);

/** Strong signals that a turn carries something worth remembering. */
const SIGNAL = /\b(always|never|prefer|i like|i hate|i don'?t like|remember|my|i'?m|i am|usually|tend to|stop|don'?t|please|call me|work|focus|goal|deadline)\b/i;

/**
 * Cheap, conservative gate deciding whether to spend an aux LLM call reviewing
 * this exchange for memory. Skip trivial acks; fire on substantive or
 * preference/correction-bearing turns. Pure.
 */
export function shouldReview(userText: string, _assistantText: string): boolean {
  const text = userText.trim();
  if (text.length === 0) return false;
  const normalized = text.toLowerCase().replace(/[!.?,\s]+$/g, "");
  if (TRIVIAL.has(normalized)) return false;
  if (SIGNAL.test(text)) return true;
  // Otherwise only bother with turns long enough to plausibly carry signal.
  return text.split(/\s+/).length >= 6;
}
