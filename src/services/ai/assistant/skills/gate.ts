type GateInput = {
  /** Number of tool calls executed in this turn. null/undefined treated as 0. */
  toolCallCount: number | null | undefined;
  /** The assistant's reply text (reserved for future heuristics). */
  assistantText: string;
};

/**
 * Cheap, conservative gate deciding whether to spend an aux LLM call extracting
 * a skill from this turn. Only fires when the turn was genuinely multi-step
 * (≥2 executed tool calls). Skip trivial/ack turns. Pure.
 */
export function shouldExtractSkill(input: GateInput): boolean {
  const count = input.toolCallCount ?? 0;
  return count >= 2;
}
