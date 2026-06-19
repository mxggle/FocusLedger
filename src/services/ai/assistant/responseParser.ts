import { validateAction } from "./actions";
import type { AssistantContext, AssistantTurnResult, ProposedAction } from "./types";
import type { LookupRequest } from "./tools";

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

export type LoopStep =
  | { kind: "lookups"; lookups: LookupRequest[] }
  | { kind: "final"; raw: string };

/** Decide whether a model turn is a read-tool request or the final answer.
 *  A turn is "lookups" only when it parses to an object with a non-empty
 *  `lookups` array; everything else is final and handed to parseAssistantResponse. */
export function parseLoopStep(raw: string): LoopStep {
  const candidate = extractJsonObject(raw);
  if (candidate) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const lookups = parsed.lookups;
      if (Array.isArray(lookups) && lookups.length > 0) {
        const cleaned = lookups
          .filter(
            (entry): entry is Record<string, unknown> =>
              typeof entry === "object" &&
              entry !== null &&
              typeof (entry as Record<string, unknown>).tool === "string"
          )
          .map((entry) => ({
            tool: String(entry.tool),
            query: typeof entry.query === "string" ? entry.query : undefined,
            category: typeof entry.category === "string" ? entry.category : undefined,
            date: typeof entry.date === "string" ? entry.date : undefined
          }));
        if (cleaned.length > 0) return { kind: "lookups", lookups: cleaned };
      }
    } catch {
      // fall through to final
    }
  }
  return { kind: "final", raw };
}
