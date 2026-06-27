import { generateChat as defaultGenerateChat } from "../../chatClient";
import type { AiSettings, ChatInput } from "../../providers";
import { assistantSkillRepository } from "../../../../db/assistantSkillRepository";
import { createId } from "../../../../utils/id";
import { applySkillOps } from "./applyOps";
import { buildSkillExtractionPrompt } from "./extractPrompt";
import { parseSkillOps } from "./parseOps";
import { shouldExtractSkill } from "./gate";
import type { AssistantSkill } from "./types";

/** Coalesce rapid back-and-forth into one skill review. */
export const SKILL_REVIEW_DEBOUNCE_MS = 2000;

export type RunSkillReviewInput = {
  settings: AiSettings; // aiModel already overridden to the aux model by the caller
  transcript: string;
  assistantText: string;
  executedToolSummaries: string[];
  existing: AssistantSkill[];
};

export type SkillRepo = Pick<typeof assistantSkillRepository, "add" | "update" | "archive" | "bumpUsage">;

export type SkillReviewDeps = {
  generateChat: (settings: AiSettings, input: ChatInput) => Promise<string>;
  repo: SkillRepo;
  makeId: () => string;
  now: () => string;
};

const defaultDeps: SkillReviewDeps = {
  generateChat: defaultGenerateChat,
  repo: assistantSkillRepository,
  makeId: () => createId("skill"),
  now: () => new Date().toISOString()
};

/** Persist the difference between the folded result and the prior list. */
async function persistDiff(prev: AssistantSkill[], next: AssistantSkill[], repo: SkillRepo, now: string): Promise<void> {
  const prevById = new Map(prev.map((skill) => [skill.id, skill]));
  for (const skill of next) {
    const before = prevById.get(skill.id);
    try {
      if (!before) {
        await repo.add(skill);
      } else if (!before.archived && skill.archived) {
        await repo.archive(skill.id, skill.updatedAt);
      } else if (
        before.name !== skill.name ||
        before.trigger !== skill.trigger ||
        before.steps !== skill.steps
      ) {
        await repo.update(skill.id, { name: skill.name, trigger: skill.trigger, steps: skill.steps }, skill.updatedAt);
      } else if (before.useCount !== skill.useCount) {
        await repo.bumpUsage(skill.id, skill.useCount, skill.lastUsedAt ?? now, skill.updatedAt);
      }
    } catch {
      // one failed write must not sink the rest
    }
  }
}

/**
 * Background skill review (ports the Hermes learning-loop skill half): gate →
 * prompt → one aux LLM call → parse → fold → persist. Fire-and-forget: never
 * throws, never blocks a turn.
 */
export async function runSkillReview(
  input: RunSkillReviewInput,
  deps: SkillReviewDeps = defaultDeps
): Promise<void> {
  if (!shouldExtractSkill({ toolCallCount: input.executedToolSummaries.length, assistantText: input.assistantText })) {
    return;
  }

  const prompt = buildSkillExtractionPrompt(input.transcript, input.executedToolSummaries, input.existing);

  let raw: string;
  try {
    raw = await deps.generateChat(input.settings, {
      system: "You extract reusable skills from a completed assistant turn and reply with strict JSON only.",
      messages: [{ role: "user", content: prompt }],
      temperature: 0
    });
  } catch {
    return; // network/provider error — leave skills untouched
  }

  const ops = parseSkillOps(raw);
  if (ops.length === 0) return;

  const now = deps.now();
  const next = applySkillOps(input.existing, ops, now, deps.makeId);
  await persistDiff(input.existing, next, deps.repo, now);
}
