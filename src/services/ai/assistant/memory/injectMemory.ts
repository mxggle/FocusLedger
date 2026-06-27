import type { MemoryEntry } from "./types";

/**
 * Render ranked memories into a system-prompt block. Empty in ⇒ empty out, so
 * the prompt is byte-identical to today when there is nothing learned yet.
 */
export function renderMemoryBlock(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map((entry) => `- (${entry.kind}) ${entry.text}`);
  return [
    "What you've learned about the user over time (use it to tailor proposals, estimates, and tone; refine it as you learn more — do not repeat it back verbatim):",
    ...lines
  ].join("\n");
}
