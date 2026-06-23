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

function currentLocalTimestamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")}${offset}`;
}

/** Run one L1 tool-calling assistant turn. Write tools are executed or queued
 * according to the permission level already captured in the snapshot. */
export async function runAssistantToolTurn(
  input: RunAssistantTurnInput,
  deps: AssistantToolRunnerDeps
): Promise<ToolLoopResult> {
  const turnTime = deps.now ? deps.now() : currentLocalTimestamp();
  const ctx = { ...buildAssistantContext(input.snapshot, input.insights), currentTime: turnTime };
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
        now: () => turnTime
      },
      onStep: input.onStep
    },
    { generateChat: deps.generateChat ?? defaultGenerateChat }
  );
}
