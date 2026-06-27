import { normalizeKey as normalize } from "../normalizeKey";
import type { AssistantSkill, SkillOp } from "./types";

/**
 * Fold the extraction model's ops into a new immutable skill list.
 * Invariants: dedup by normalized name (update useCount instead of duplicating);
 * pinned entries are protected from update/archive; nothing is hard-deleted
 * (archive-not-delete); unknown-id ops are dropped. Pure — `now`/`makeId` injected.
 */
export function applySkillOps(
  existing: AssistantSkill[],
  ops: SkillOp[],
  now: string,
  makeId: () => string
): AssistantSkill[] {
  // Working copy — we'll replace entries immutably
  let result: AssistantSkill[] = existing.map((s) => ({ ...s }));

  const byId = () => new Map(result.map((s) => [s.id, s]));
  const byName = () => new Map(result.map((s) => [normalize(s.name), s]));

  for (const op of ops) {
    if (op.op === "create") {
      const nameMap = byName();
      const dup = nameMap.get(normalize(op.name));
      if (dup) {
        // Dedup — bump usage instead of duplicating
        result = result.map((s) =>
          s.id === dup.id
            ? { ...s, useCount: s.useCount + 1, lastUsedAt: now, updatedAt: now }
            : s
        );
        continue;
      }
      const newSkill: AssistantSkill = {
        id: makeId(),
        name: op.name,
        trigger: op.trigger,
        steps: op.steps,
        pinned: false,
        archived: false,
        useCount: 0,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now
      };
      result = [...result, newSkill];
      continue;
    }

    const idMap = byId();
    const target = idMap.get(op.id);
    if (!target || target.pinned) continue; // unknown id or protected → drop

    if (op.op === "update") {
      result = result.map((s) =>
        s.id === op.id
          ? {
              ...s,
              name: op.name ?? s.name,
              trigger: op.trigger ?? s.trigger,
              steps: op.steps ?? s.steps,
              updatedAt: now
            }
          : s
      );
    } else {
      // archive
      result = result.map((s) =>
        s.id === op.id ? { ...s, archived: true, updatedAt: now } : s
      );
    }
  }

  return result;
}
