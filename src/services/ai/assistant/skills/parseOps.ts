import type { SkillOp } from "./types";

/** Pull the outermost JSON object containing a "skills" key out of a model reply, tolerating fences/prose. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function toOp(entry: unknown): SkillOp | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;

  if (record.op === "create") {
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const trigger = typeof record.trigger === "string" ? record.trigger.trim() : "";
    const steps = typeof record.steps === "string" ? record.steps.trim() : "";
    if (!name || !trigger || !steps) return null;
    return { op: "create", name, trigger, steps };
  }

  if (record.op === "update" && typeof record.id === "string" && record.id) {
    const op: SkillOp & { op: "update" } = { op: "update", id: record.id };
    if (typeof record.name === "string" && record.name.trim()) op.name = record.name.trim();
    if (typeof record.trigger === "string" && record.trigger.trim()) op.trigger = record.trigger.trim();
    if (typeof record.steps === "string" && record.steps.trim()) op.steps = record.steps.trim();
    const hasUpdate = op.name !== undefined || op.trigger !== undefined || op.steps !== undefined;
    return hasUpdate ? op : null;
  }

  if (record.op === "archive" && typeof record.id === "string" && record.id) {
    return { op: "archive", id: record.id };
  }

  return null; // unknown op / malformed → dropped
}

/** Parse the extraction model's output into validated SkillOps. Never throws; drops invalid. */
export function parseSkillOps(raw: string): SkillOp[] {
  try {
    if (typeof raw !== "string") return [];
    const candidate = extractJsonObject(raw);
    if (!candidate) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return [];
    }
    if (typeof parsed !== "object" || parsed === null) return [];
    const record = parsed as Record<string, unknown>;
    const skills = record["skills"];
    if (!Array.isArray(skills)) return [];
    return skills.map(toOp).filter((op): op is SkillOp => op !== null);
  } catch {
    return [];
  }
}
