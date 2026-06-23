import {
  ASSISTANT_TEMPERATURE,
  MAX_STEPS,
  STEP_LABELS,
  buildLoopState,
  runAgentLoop,
  type AgentLoopDeps
} from "./agentLoop";
import type { AgentTaskStore, PermissionLevel } from "./agentTools/types";
import { parseAssistantResponse, parseLoopStep } from "./responseParser";
import { executeLookup } from "./tools";
import { runToolLoop, type ToolLoopDeps, type ToolLoopResult } from "./toolLoop";
import { generateChat as defaultGenerateChat, streamChat as defaultStreamChat } from "../chatClient";
import type { AiSettings, ChatInput, ChatTurn } from "../providers";
import { buildAssistantContext, type AssistantStoreSnapshot } from "./contextBuilder";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import type { RecallEntry } from "./recallHistory";
import type { AssistantTurnResult, ProposedAction } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";

export type RunAssistantTurnInput = {
  settings: AiSettings;
  snapshot: AssistantStoreSnapshot;
  messages: ChatTurn[]; // full conversation history, oldest first, last = newest user turn
  insights?: RetrospectiveInsights | null; // pre-computed retrospective facts
  history?: RecallEntry[]; // trailing window of logged reflections, for the recall tool
  onStep?: (label: string) => void; // live status as the agent loop runs lookups
};

/** Injected for tests; defaults to the real network client. */
export type AssistantRunnerDeps = AgentLoopDeps;

export type AssistantToolRunnerDeps = Partial<ToolLoopDeps> & {
  store: AgentTaskStore;
  now?: () => string;
};

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

/** Streaming transport — like generateChat but forwards SSE deltas and returns
 *  the full accumulated text. Aborts resolve with the partial text, never throw. */
export type StreamChatFn = (
  settings: AiSettings,
  input: ChatInput,
  cb: { onToken?: (chunk: string) => void; signal?: AbortSignal }
) => Promise<string>;

export type StreamCallbacks = {
  onStep?: (label: string) => void;
  onToken?: (chunk: string) => void;
  onActions?: (actions: ProposedAction[]) => void;
  onDone?: (fullReply: string) => void;
  signal?: AbortSignal;
};

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /abort/i.test(error.message))
  );
}

function stepLabel(tool: string): string {
  return STEP_LABELS[tool] ?? `Looking up ${tool}…`;
}

type StreamMode = "pending" | "live" | "buffered";

/**
 * Streaming variant of {@link runAssistantTurn}. Every agent-loop turn is
 * streamed once; the first non-whitespace character classifies it:
 *   - `{`  → buffered (the JSON tool protocol: a `{ lookups: [...] }` request,
 *     or a legacy `{ reply, actions }` final). Tokens are held back and never
 *     reach the UI; on completion `parseLoopStep` decides lookups-vs-final.
 *   - otherwise → the new markdown-first final format. Tokens stream live to
 *     `onToken`, but a trailing ` ```json ` actions fence is suppressed so the
 *     UI only ever shows the reply (no fence-then-vanish jump).
 *
 * After the full text is collected (or the stream is aborted), the reply is
 * parsed and `onActions` then `onDone` fire. An abort yields the accumulated
 * markdown partial as the final reply — it never throws. Any other error
 * propagates to the caller. The step-budget fallback stays non-streamed.
 */
export async function runAssistantTurnStreaming(
  input: RunAssistantTurnInput,
  callbacks: StreamCallbacks,
  deps?: AgentLoopDeps & { streamChat?: StreamChatFn }
): Promise<void> {
  const { ctx, system, toolDeps } = buildLoopState(input);
  const generateChat = deps?.generateChat ?? defaultGenerateChat;
  const streamChatFn = deps?.streamChat ?? defaultStreamChat;

  const messages: ChatTurn[] = [...input.messages];
  let lastRaw = "";

  const emitStep = (label: string) => {
    input.onStep?.(label);
    callbacks.onStep?.(label);
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    let pending = ""; // not-yet-forwarded text (held back during classification or fence detection)
    // Held in an object so TS doesn't narrow `mode` across the onToken closure
    // (it is reclassified during the awaited stream).
    const cls: { mode: StreamMode } = { mode: "pending" };
    let fenced = false; // true once the trailing ``` actions fence has begun

    // Forward live markdown to onToken, holding back any run of 1–2 trailing
    // backticks that might be the start of a ``` fence. Once a fence opens,
    // swallow the fence + actions tail (parsed at the end instead).
    const processLive = () => {
      if (fenced) return;
      const fi = pending.indexOf("```");
      if (fi !== -1) {
        if (fi > 0) callbacks.onToken?.(pending.slice(0, fi));
        fenced = true;
        return;
      }
      let hold = 0;
      for (let i = pending.length - 1; i >= 0 && i >= pending.length - 2; --i) {
        if (pending[i] === "`") ++hold;
        else break;
      }
      const forwardLen = pending.length - hold;
      if (forwardLen > 0) callbacks.onToken?.(pending.slice(0, forwardLen));
      pending = hold > 0 ? pending.slice(forwardLen) : "";
    };

    let finalText = "";
    try {
      finalText = await streamChatFn(
        input.settings,
        { system, messages, temperature: ASSISTANT_TEMPERATURE },
        {
          signal: callbacks.signal,
          onToken: (chunk: string) => {
            pending += chunk;
            if (cls.mode === "buffered") return; // JSON tool protocol — hold back
            if (cls.mode === "live") {
              processLive();
              return;
            }
            // pending: classify on the first non-whitespace character
            const trimmed = pending.trimStart();
            if (trimmed.length === 0) return;
            cls.mode = trimmed[0] === "{" ? "buffered" : "live";
            if (cls.mode === "live") processLive();
          }
        }
      );
    } catch (error) {
      if (!isAbortError(error)) throw error;
      finalText = "";
    }
    if (typeof finalText !== "string") finalText = "";

    // Flush any held-back trailing text so the streamed content matches finalText.
    if (cls.mode === "live" && !fenced && pending.length > 0) {
      callbacks.onToken?.(pending);
      pending = "";
    }

    lastRaw = finalText;
    const aborted = callbacks.signal?.aborted === true;

    if (aborted) {
      const reply = cls.mode === "live"
        ? fenced
          ? finalText.slice(0, finalText.indexOf("```"))
          : finalText
        : "";
      const result = parseAssistantResponse(reply, ctx);
      await callbacks.onActions?.(result.actions);
      await callbacks.onDone?.(result.reply);
      return;
    }

    // Buffered / still-pending turns speak the JSON protocol: lookups or a
    // legacy `{ reply, actions }` final. Neither streamed to the UI.
    if (cls.mode === "buffered" || cls.mode === "pending") {
      const parsed = parseLoopStep(finalText);
      if (parsed.kind === "lookups") {
        for (const lookup of parsed.lookups) emitStep(stepLabel(lookup.tool));
        const results = parsed.lookups.map((l) => executeLookup(l, toolDeps)).join("\n\n");
        messages.push({ role: "assistant", content: finalText });
        messages.push({
          role: "user",
          content: `Tool results:\n${results}\n\nContinue, or give your final answer.`
        });
        continue;
      }
      const result = parseAssistantResponse(finalText, ctx);
      if (result.reply.length > 0) callbacks.onToken?.(result.reply);
      await callbacks.onActions?.(result.actions);
      await callbacks.onDone?.(result.reply);
      return;
    }

    // Live markdown final — already streamed (minus the suppressed fence tail).
    const result = parseAssistantResponse(finalText, ctx);
    await callbacks.onActions?.(result.actions);
    await callbacks.onDone?.(result.reply);
    return;
  }

  // Budget exhausted — force a final answer non-streamed (rare fallback).
  emitStep("Drafting your plan…");
  let finalRaw = "";
  try {
    finalRaw = await generateChat(input.settings, {
      system,
      messages: [...messages, { role: "user", content: "Give your final answer now as the { reply, actions } object." }],
      temperature: ASSISTANT_TEMPERATURE
    });
  } catch {
    finalRaw = lastRaw;
  }
  const result = parseAssistantResponse(finalRaw, ctx);
  if (result.reply.length > 0) callbacks.onToken?.(result.reply);
  await callbacks.onActions?.(result.actions);
  await callbacks.onDone?.(result.reply);
}
