import type { ChatTurn } from "../../providers";
import type { MemoryEntry } from "./types";

const SYSTEM = [
  "You maintain a long-term memory of the user for a personal productivity assistant.",
  "Review the latest exchange and decide what, if anything, is worth remembering long-term.",
  "Focus on durable facts about the user: their persona and personal details, their",
  "preferences, their work style, recurring context (projects, goals, deadlines), and",
  "expectations about how the assistant should behave. Ignore one-off task details.",
  "",
  "Reply with ONLY a JSON array of operations (no prose). Each item is one of:",
  '  { "op": "add", "kind": "preference|workstyle|context|fact", "text": "<one sentence>" }',
  '  { "op": "update", "id": "<existing id>", "text": "<new sentence>" }',
  '  { "op": "archive", "id": "<existing id>" }   // when a fact is now wrong/outdated',
  "Rules: add only genuinely new, durable facts; if it duplicates an existing memory, omit it;",
  "if it contradicts an existing memory, update or archive that one by id; keep each text to a",
  "single concise sentence in third person. If nothing is worth saving, reply with []."
].join("\n");

function renderExisting(existing: MemoryEntry[]): string {
  if (existing.length === 0) return "Existing memories: none.";
  const lines = existing.map((e) => `- [${e.id}] (${e.kind}) ${e.text}`);
  return ["Existing memories (dedup/update/archive against these):", ...lines].join("\n");
}

/** Build the system + single user message for the background review aux call. */
export function buildReviewPrompt(
  exchange: { userText: string; assistantText: string },
  existing: MemoryEntry[]
): { system: string; messages: ChatTurn[] } {
  const content = [
    renderExisting(existing),
    "",
    "Latest exchange:",
    `User: ${exchange.userText}`,
    `Assistant: ${exchange.assistantText}`,
    "",
    "Return the JSON array of memory operations now."
  ].join("\n");
  return { system: SYSTEM, messages: [{ role: "user", content }] };
}
