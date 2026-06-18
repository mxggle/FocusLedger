import { validateAction } from "./actions";
import type { AssistantContext, AssistantTurnResult, ProposedAction } from "./types";

/** Pull the outermost JSON object out of a model reply, tolerating code fences
 *  or stray prose around it. Returns null if no object-looking span is found. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

export function parseAssistantResponse(raw: string, ctx: AssistantContext): AssistantTurnResult {
  const candidate = extractJsonObject(raw);

  let parsed: unknown = null;
  if (candidate) {
    try {
      parsed = JSON.parse(candidate);
    } catch {
      parsed = null;
    }
  }

  // Unparseable → treat the whole text as a plain reply with no actions.
  if (typeof parsed !== "object" || parsed === null) {
    return { reply: raw.trim(), actions: [] };
  }

  const record = parsed as Record<string, unknown>;
  const reply = typeof record.reply === "string" && record.reply.trim().length > 0
    ? record.reply.trim()
    : raw.trim();

  const rawActions = Array.isArray(record.actions) ? record.actions : [];
  const actions = rawActions
    .map((entry) => validateAction(entry, ctx))
    .filter((entry): entry is ProposedAction => entry !== null);

  return { reply, actions };
}
