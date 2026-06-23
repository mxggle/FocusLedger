import type { MemoryEntry, MemoryOp, MemoryWrite } from "./types";

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Fold the review model's ops into concrete persistence writes, deterministically.
 * Invariants: near-duplicate adds become usage bumps (never duplicate rows);
 * pinned entries are protected from update/archive; nothing is hard-deleted
 * (archive only); unknown-id ops are dropped. Pure — `now`/`makeId` injected.
 */
export function applyMemoryOps(
  existing: MemoryEntry[],
  ops: MemoryOp[],
  now: string,
  makeId: () => string
): { writes: MemoryWrite[] } {
  const writes: MemoryWrite[] = [];
  const byId = new Map(existing.map((e) => [e.id, e]));
  const byText = new Map(existing.map((e) => [normalize(e.text), e]));

  for (const op of ops) {
    if (op.op === "add") {
      const dup = byText.get(normalize(op.text));
      if (dup) {
        writes.push({ kind: "bumpUsage", id: dup.id, useCount: dup.useCount + 1, lastUsedAt: now, updatedAt: now });
        continue;
      }
      const entry: MemoryEntry = {
        id: makeId(), kind: op.kind, text: op.text, pinned: false, status: "active",
        sourceMessageId: null, useCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now
      };
      writes.push({ kind: "add", entry });
      byText.set(normalize(op.text), entry);
      continue;
    }
    const target = byId.get(op.id);
    if (!target || target.pinned) continue; // unknown or protected → drop
    if (op.op === "update") {
      writes.push({ kind: "updateText", id: target.id, text: op.text ?? target.text, memKind: op.kind ?? target.kind, updatedAt: now });
    } else {
      writes.push({ kind: "archive", id: target.id, updatedAt: now });
    }
  }
  return { writes };
}
