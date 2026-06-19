import { generateChat as defaultGenerateChat } from "../chatClient";
import type { AiSettings, ChatInput, ChatTurn } from "../providers";
import { buildAssistantContext, type AssistantStoreSnapshot } from "./contextBuilder";
import { parseAssistantResponse } from "./responseParser";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import type { AssistantTurnResult } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";

/** Low temperature keeps proposals consistent for the same day state. */
const ASSISTANT_TEMPERATURE = 0.3;

export type RunAssistantTurnInput = {
  settings: AiSettings;
  snapshot: AssistantStoreSnapshot;
  messages: ChatTurn[]; // full conversation history, oldest first, last = newest user turn
  insights?: RetrospectiveInsights | null; // pre-computed retrospective facts
};

/** Injected for tests; defaults to the real network client. */
export type AssistantRunnerDeps = {
  generateChat: (settings: AiSettings, input: ChatInput) => Promise<string>;
};

export async function runAssistantTurn(
  input: RunAssistantTurnInput,
  deps: AssistantRunnerDeps = { generateChat: defaultGenerateChat }
): Promise<AssistantTurnResult> {
  const ctx = buildAssistantContext(input.snapshot, input.insights);
  const system = buildAssistantSystemPrompt(ctx);
  const raw = await deps.generateChat(input.settings, {
    system,
    messages: input.messages,
    temperature: ASSISTANT_TEMPERATURE
  });
  return parseAssistantResponse(raw, ctx);
}
