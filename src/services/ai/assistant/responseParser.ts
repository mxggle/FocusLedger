/** Pull the outermost JSON object out of a model reply, tolerating code fences
 *  or stray prose around it. Returns null if no object-looking span is found. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
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
