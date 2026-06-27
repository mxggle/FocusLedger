import type { AssistantSkill } from "./types";

const INSTRUCTIONS = [
  "You are a skill extractor for a personal productivity assistant.",
  "Review the completed conversation turn and executed tools below.",
  "Decide whether the assistant just performed a generalizable, reusable multi-step procedure.",
  "",
  "If yes, propose exactly 1 skill. If not, propose 0 skills.",
  "A skill must be: general and reusable across similar future requests — NOT task-specific.",
  "Do NOT include specific task ids, timestamps, or user-specific values in the steps.",
  "Focus on the reusable pattern: what type of request triggers this, and what steps solve it generally.",
  "",
  "Reply with ONLY a JSON object (no prose) matching this shape:",
  '  { "skills": [ <0 or 1 SkillOp> ] }',
  "",
  "A SkillOp is one of:",
  '  { "op": "create", "name": "<short descriptive name>", "trigger": "<when this skill applies>", "steps": "<reusable generalized steps>" }',
  '  { "op": "update", "id": "<existing skill id>", "name"?: "...", "trigger"?: "...", "steps"?: "..." }',
  '  { "op": "archive", "id": "<existing skill id>" }',
  "",
  "Rules:",
  "- At most one skill per turn. If the turn is trivial, return { \"skills\": [] }.",
  "- The trigger must be a concise phrase describing WHEN to apply this skill (e.g. 'when asked to reschedule multiple tasks').",
  "- The steps must be reusable and generalized — no specific ids or values from this particular task.",
  "- Prefer updating an existing skill (by its id) over creating a near-duplicate; archive one that is now wrong."
].join("\n");

/** Render the already-learned skills so the model can update/archive by id and avoid duplicates. */
function renderExistingSkills(existing: AssistantSkill[]): string {
  const active = existing.filter((skill) => !skill.archived);
  if (active.length === 0) return "Existing skills: none";
  const lines = active.map((skill) => `  - id=${skill.id} | name: ${skill.name} | trigger: ${skill.trigger}`);
  return ["Existing skills (reuse these ids for update/archive — do not duplicate them):", ...lines].join("\n");
}

/**
 * Build the extraction prompt for the background aux LLM call.
 * Returns the full prompt string (no system/user split needed for a single-turn call).
 * `existing` is passed so the model can emit valid update/archive ops and avoid
 * proposing a skill that already exists.
 */
export function buildSkillExtractionPrompt(
  transcript: string,
  executedToolSummaries: string[],
  existing: AssistantSkill[] = []
): string {
  const toolSection =
    executedToolSummaries.length > 0
      ? ["Executed tools this turn:", ...executedToolSummaries.map((t) => `  - ${t}`)].join("\n")
      : "Executed tools this turn: none";

  return [
    INSTRUCTIONS,
    "",
    "---",
    "",
    renderExistingSkills(existing),
    "",
    toolSection,
    "",
    "Conversation transcript:",
    transcript,
    "",
    "Return the JSON object now."
  ].join("\n");
}
