import { runAgentLoop, type AgentLoopDeps } from "./agentLoop";
import type { AiSettings, ChatTurn } from "../providers";
import type { AssistantStoreSnapshot } from "./contextBuilder";
import type { AssistantTurnResult } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";

export type RunAssistantTurnInput = {
  settings: AiSettings;
  snapshot: AssistantStoreSnapshot;
  messages: ChatTurn[]; // full conversation history, oldest first, last = newest user turn
  insights?: RetrospectiveInsights | null; // pre-computed retrospective facts
  onStep?: (label: string) => void; // live status as the agent loop runs lookups
};

/** Injected for tests; defaults to the real network client. */
export type AssistantRunnerDeps = AgentLoopDeps;

/**
 * Run one assistant turn. Delegates to the tool-using agent loop, which may
 * perform read-only lookups before producing the final reply + proposed actions.
 */
export async function runAssistantTurn(
  input: RunAssistantTurnInput,
  deps?: AssistantRunnerDeps
): Promise<AssistantTurnResult> {
  return runAgentLoop(input, deps);
}
