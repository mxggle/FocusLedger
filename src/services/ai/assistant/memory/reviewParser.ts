import { MEMORY_KINDS, type MemoryKind, type MemoryOp } from "./types";

/** Pull the outermost JSON array out of a model reply, tolerating fences/prose. */
function extractJsonArray(raw: string): string | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function isKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && (MEMORY_KINDS as string[]).includes(value);
}

function toOp(entry: unknown): MemoryOp | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  if (record.op === "add" && isKind(record.kind) && typeof record.text === "string" && record.text.trim()) {
    return { op: "add", kind: record.kind, text: record.text.trim() };
  }
  if (record.op === "update" && typeof record.id === "string" && record.id) {
    const op: MemoryOp = { op: "update", id: record.id };
    if (typeof record.text === "string" && record.text.trim()) op.text = record.text.trim();
    if (isKind(record.kind)) op.kind = record.kind;
    return op.text || op.kind ? op : null;
  }
  if (record.op === "archive" && typeof record.id === "string" && record.id) {
    return { op: "archive", id: record.id };
  }
  return null; // unknown op / "skip" / malformed → dropped
}

/** Parse the review model's output into validated ops. Never throws; drops invalid. */
export function parseMemoryOps(raw: string): MemoryOp[] {
  const candidate = extractJsonArray(raw);
  if (!candidate) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(toOp).filter((op): op is MemoryOp => op !== null);
}
