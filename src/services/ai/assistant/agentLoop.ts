import { generateChat as defaultGenerateChat } from "../chatClient";
import type { AiSettings, ChatInput, ChatTurn } from "../providers";
import { buildAssistantContext, type AssistantStoreSnapshot } from "./contextBuilder";
import { parseAssistantResponse, parseLoopStep } from "./responseParser";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import { executeLookup, type ToolDeps } from "./tools";
import type { AssistantTurnResult } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";

/** Low temperature keeps proposals consistent for the same day state. */
const ASSISTANT_TEMPERATURE = 0.3;
/** Maximum lookup rounds before we force a final answer. */
const MAX_STEPS = 4;

const STEP_LABELS: Record<string, string> = {
  search_tasks: "Scanning your existing tasks…",
  get_calibration: "Checking how long similar work takes…"
};

export type RunAgentLoopInput = {
  settings: AiSettings;
  snapshot: AssistantStoreSnapshot;
  messages: ChatTurn[]; // full conversation history, oldest first, last = newest user turn
  insights?: RetrospectiveInsights | null;
  onStep?: (label: string) => void;
};

/** Injected for tests; defaults to the real network client. */
export type AgentLoopDeps = {
  generateChat: (settings: AiSettings, input: ChatInput) => Promise<string>;
};

/**
 * Provider-agnostic agent loop. The model may respond with a `lookups` array of
 * read-only tool requests (executed deterministically in TS) or a final
 * `{ reply, actions }` object. We feed lookup results back and re-call until the
 * model finalizes or we exhaust MAX_STEPS, then parse whatever we have.
 */
export async function runAgentLoop(
  input: RunAgentLoopInput,
  deps: AgentLoopDeps = { generateChat: defaultGenerateChat }
): Promise<AssistantTurnResult> {
  const ctx = buildAssistantContext(input.snapshot, input.insights);
  const system = buildAssistantSystemPrompt(ctx);
  const toolDeps: ToolDeps = { allTasks: input.snapshot.allTasks, insights: input.insights ?? null };

  const messages: ChatTurn[] = [...input.messages];
  let lastRaw = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const raw = await deps.generateChat(input.settings, {
      system,
      messages,
      temperature: ASSISTANT_TEMPERATURE
    });
    lastRaw = raw;

    const parsed = parseLoopStep(raw);
    if (parsed.kind === "final") {
      return parseAssistantResponse(raw, ctx);
    }

    for (const lookup of parsed.lookups) {
      input.onStep?.(STEP_LABELS[lookup.tool] ?? `Looking up ${lookup.tool}…`);
    }
    const results = parsed.lookups.map((lookup) => executeLookup(lookup, toolDeps)).join("\n\n");
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `Tool results:\n${results}\n\nContinue, or give your final answer.`
    });
  }

  input.onStep?.("Drafting your plan…");
  const finalRaw = await deps
    .generateChat(input.settings, {
      system,
      messages: [...messages, { role: "user", content: 'Give your final answer now as the { reply, actions } object.' }],
      temperature: ASSISTANT_TEMPERATURE
    })
    .catch(() => lastRaw);
  return parseAssistantResponse(finalRaw, ctx);
}
