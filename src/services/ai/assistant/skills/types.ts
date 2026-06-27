/** A reusable skill the assistant has learned from experience. */
export type AssistantSkill = {
  id: string;
  name: string; // short, human-readable label
  trigger: string; // when this skill applies (e.g. "when asked to delay tasks")
  steps: string; // reusable, generalized steps (markdown or PTC snippet)
  createdAt: string; // ISO
  updatedAt: string; // ISO
  useCount: number; // bumped when the skill is recalled and used
  lastUsedAt: string | null; // ISO or null
  pinned: boolean; // user-pinned: protected from auto-archive
  archived: boolean; // soft-deleted; recoverable
};

/** An operation the extraction model proposes. Unknown ops are dropped upstream. */
export type SkillOp =
  | { op: "create"; name: string; trigger: string; steps: string }
  | { op: "update"; id: string; name?: string; trigger?: string; steps?: string }
  | { op: "archive"; id: string };
