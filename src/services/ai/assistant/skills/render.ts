import type { AssistantSkill } from "./types";

/**
 * Render ranked skills into a system-prompt block. Empty in ⇒ empty out, so
 * the prompt is byte-identical to today when there is nothing learned yet.
 */
export function renderSkillBlock(skills: AssistantSkill[]): string {
  if (skills.length === 0) return "";
  const lines = skills.map(
    (s) => `- **${s.name}** (use when: ${s.trigger})\n  Steps: ${s.steps}`
  );
  return [
    "Learned skills you can reuse (apply when the trigger matches; adapt steps to the specific request — do not copy task-specific ids or values verbatim):",
    ...lines
  ].join("\n");
}
