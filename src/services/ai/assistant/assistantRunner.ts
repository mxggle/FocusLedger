import type { AgentTaskStore, PermissionLevel } from "./agentTools/types";
import { runToolLoop, type ToolLoopDeps, type ToolLoopResult } from "./toolLoop";
import { generateChat as defaultGenerateChat } from "../chatClient";
import type { AiSettings, ChatTurn } from "../providers";
import { buildAssistantContext, type AssistantStoreSnapshot } from "./contextBuilder";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import type { RecallEntry } from "./recallHistory";
import type { RetrospectiveInsights } from "../../retrospect/types";

export type RunAssistantTurnInput = {
  settings: AiSettings;
  snapshot: AssistantStoreSnapshot;
  messages: ChatTurn[]; // full conversation history, oldest first, last = newest user turn
  insights?: RetrospectiveInsights | null; // pre-computed retrospective facts
  history?: RecallEntry[]; // trailing window of logged reflections, for the recall tool
  onStep?: (label: string) => void; // live status as the tool loop runs
};

export type AssistantToolRunnerDeps = Partial<ToolLoopDeps> & {
  store: AgentTaskStore;
  now?: () => string;
};

function permissionLevelFor(snapshot: AssistantStoreSnapshot): PermissionLevel {
  return snapshot.permissionLevel ?? "auto";
}

/** Run one L1 tool-calling assistant turn. Write tools are executed or queued
 * according to the permission level already captured in the snapshot. */
export async function runAssistantToolTurn(
  input: RunAssistantTurnInput,
  deps: AssistantToolRunnerDeps
): Promise<ToolLoopResult> {
  const ctx = buildAssistantContext(input.snapshot, input.insights);
  const system = buildAssistantSystemPrompt(ctx);
  return runToolLoop(
    {
      settings: input.settings,
      system,
      messages: input.messages,
      level: permissionLevelFor(input.snapshot),
      deps: {
        store: deps.store,
        ctx,
        insights: input.insights ?? null,
        history: input.history ?? [],
        now: deps.now ?? (() => new Date().toISOString())
      },
      onStep: input.onStep
    },
    { generateChat: deps.generateChat ?? defaultGenerateChat }
  );
}
