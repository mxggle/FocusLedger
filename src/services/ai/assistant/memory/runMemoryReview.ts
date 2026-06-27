import { generateChat as defaultGenerateChat } from "../../chatClient";
import type { AiSettings, ChatInput } from "../../providers";
import { assistantMemoryRepository } from "../../../../db/assistantMemoryRepository";
import { createId } from "../../../../utils/id";
import { applyMemoryOps } from "./applyOps";
import { buildReviewPrompt } from "./reviewPrompt";
import { parseMemoryOps } from "./reviewParser";
import { shouldReview } from "./reviewGate";
import type { MemoryEntry } from "./types";

/** Coalesce rapid back-and-forth into one review. */
export const MEMORY_REVIEW_DEBOUNCE_MS = 1500;

export type RunMemoryReviewInput = {
  settings: AiSettings; // aiModel already overridden to the aux model by the caller
  userText: string;
  assistantText: string;
  existing: MemoryEntry[];
};

export type MemoryRepo = Pick<
  typeof assistantMemoryRepository,
  "add" | "updateText" | "bumpUsage" | "archive"
>;

export type MemoryReviewDeps = {
  generateChat: (settings: AiSettings, input: ChatInput) => Promise<string>;
  repo: MemoryRepo;
  makeId: () => string;
  now: () => string;
};

const defaultDeps: MemoryReviewDeps = {
  generateChat: defaultGenerateChat,
  repo: assistantMemoryRepository,
  makeId: () => createId("mem"),
  now: () => new Date().toISOString()
};

/**
 * Background memory review (ports Hermes background_review, memory half): gate →
 * prompt → one aux LLM call → parse → fold → persist. Fire-and-forget: never
 * throws, never blocks a turn. Returns when done (or skipped).
 */
export async function runMemoryReview(
  input: RunMemoryReviewInput,
  deps: MemoryReviewDeps = defaultDeps
): Promise<void> {
  if (!shouldReview(input.userText, input.assistantText)) return;

  const { system, messages } = buildReviewPrompt(
    { userText: input.userText, assistantText: input.assistantText },
    input.existing
  );

  let raw: string;
  try {
    raw = await deps.generateChat(input.settings, { system, messages, temperature: 0 });
  } catch {
    return; // network/provider error — leave memory untouched
  }

  const ops = parseMemoryOps(raw);
  if (ops.length === 0) return;

  const { writes } = applyMemoryOps(input.existing, ops, deps.now(), deps.makeId);
  for (const write of writes) {
    try {
      if (write.kind === "add") await deps.repo.add(write.entry);
      else if (write.kind === "updateText") await deps.repo.updateText(write.id, write.text, write.memKind, write.updatedAt);
      else if (write.kind === "bumpUsage") await deps.repo.bumpUsage(write.id, write.useCount, write.lastUsedAt, write.updatedAt);
      else await deps.repo.archive(write.id, write.updatedAt);
    } catch {
      // one failed write must not sink the rest
    }
  }
}
