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

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The streaming final-turn format puts the actions array in a trailing fenced
 * code block (so the markdown reply can stream verbatim). Find that block when
 * it sits at the very end of the text and return its contents plus everything
 * before it.
 */
function extractTrailingFence(raw: string): { content: string; before: string } | null {
  const trimmed = raw.replace(/\s+$/, "");
  if (!trimmed.endsWith("```")) return null;
  const closeIdx = trimmed.length - 3;
  const openIdx = trimmed.lastIndexOf("```", closeIdx - 1);
  if (openIdx <= 0) return null;
  const inner = trimmed.slice(openIdx + 3); // strip opening fence
  const firstNl = inner.indexOf("\n");
  if (firstNl === -1) return null;
  const content = inner.slice(firstNl + 1).replace(/\n```$/, "").trim();
  const before = trimmed.slice(0, openIdx).trim();
  return { content, before };
}

export function parseAssistantResponse(raw: string, ctx: AssistantContext): AssistantTurnResult {
  // 1. Trailing fenced JSON actions block (new streaming format): reply is the
  //    markdown before the fence, actions are the fenced array.
  const fence = extractTrailingFence(raw);
  if (fence) {
    const parsed = tryParseJson(fence.content);
    if (Array.isArray(parsed)) {
      const actions = parsed
        .map((entry) => validateAction(entry, ctx))
        .filter((entry): entry is ProposedAction => entry !== null);
      const reply = fence.before.length > 0 ? fence.before : raw.trim();
      return { reply, actions };
    }
    // A fenced {reply, actions} object falls through to the legacy branch.
  }

  // 2. Legacy single-JSON-object format: { "reply": ..., "actions": [...] }.
  const candidate = extractJsonObject(raw);

  let parsed: unknown = null;
  if (candidate) {
    parsed = tryParseJson(candidate);
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
            date: typeof entry.date === "string" ? entry.date : undefined,
            status: typeof entry.status === "string" ? entry.status : undefined,
            undated: typeof entry.undated === "boolean" ? entry.undated : undefined
          }));
        if (cleaned.length > 0) return { kind: "lookups", lookups: cleaned };
      }
    } catch {
      // fall through to final
    }
  }
  return { kind: "final", raw };
}

export type ParsedToolCall = { name: string; args: unknown };

/** Parse a tool-call turn. Returns null when the text is a final markdown answer. */
export function parseToolCalls(raw: string): ParsedToolCall[] | null {
  const candidate = extractJsonObject(raw);
  if (!candidate) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const calls = (parsed as Record<string, unknown>).tool_calls;
  if (!Array.isArray(calls)) return null;

  const cleaned = calls
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).name === "string"
    )
    .map((entry) => ({ name: String(entry.name), args: entry.args ?? {} }));

  return cleaned.length > 0 ? cleaned : null;
}
