import { generateChat as defaultGenerateChat } from "../chatClient";
import type { AiSettings, ChatInput, ChatTurn } from "../providers";
import { isDestructive, needsConfirm } from "./agentTools/permissions";
import { nativeToolSpecs, toolByName } from "./agentTools/registry";
import type { AgentToolDeps, PermissionLevel, ToolCallRecord } from "./agentTools/types";
import { parseToolCalls, type ParsedToolCall } from "./responseParser";
import { createId } from "../../../utils/id";
import { describeToolCallForDisplay } from "./toolDisplay";
import { runProgram } from "./ptc/sandbox";
import { buildHostTools } from "./ptc/registryBridge";

export const TOOL_TEMPERATURE = 0.3;
export const MAX_STEPS = 12;
export const PROGRAM_TIMEOUT_MS = 8000;
export const PROGRAM_MAX_CALLS = 300;
/** Output budget per step. Raised above the provider default (2048) because a
 *  step can carry a whole execute_program source or a long final answer, and a
 *  truncated tool turn wastes a loop step (or worse, garbles call args). */
export const TOOL_MAX_TOKENS = 4096;

export type ToolLoopInput = {
  settings: AiSettings;
  system: string;
  messages: ChatTurn[];
  level: PermissionLevel;
  deps: AgentToolDeps;
  onStep?: (label: string) => void;
  onToken?: (chunk: string) => void;
  onStreamStep?: (stepIndex: number, kind: "reasoning" | "final") => void;
  signal?: AbortSignal;
};

export type ToolLoopDeps = {
  generateChat?: (settings: AiSettings, input: ChatInput, signal?: AbortSignal) => Promise<string>;
  generateChatV2?: (
    settings: AiSettings,
    input: ChatInput,
    cb: { onToken?: (chunk: string) => void; signal?: AbortSignal }
  ) => Promise<{ text: string; toolCalls: ParsedToolCall[]; truncated?: boolean }>;
};

export type ToolLoopResult = { reply: string; toolCalls: ToolCallRecord[] };

function expectedUpdatedAtFor(rec: Pick<ToolCallRecord, "undo">, deps: AgentToolDeps): string | undefined {
  if (!rec.undo || rec.undo.kind !== "restore_task") return undefined;
  const taskId = rec.undo.taskId;
  return deps.store.getAllTasks().find((task) => task.id === taskId)?.updated_at;
}

/** Give every call a stable id so structured replay can pair results to calls
 *  even for providers that don't emit ids (Gemini, JSON text fallback). */
function ensureCallIds(calls: ParsedToolCall[], step: number): (ParsedToolCall & { id: string })[] {
  return calls.map((call, idx) => ({ ...call, id: call.id ?? `call_${step}_${idx}` }));
}

export async function runToolLoop(
  input: Omit<ToolLoopInput, "settings"> & { settings?: AiSettings },
  deps: ToolLoopDeps = { generateChat: defaultGenerateChat }
): Promise<ToolLoopResult> {
  const settings = input.settings ?? ({} as AiSettings);
  const messages: ChatTurn[] = [...input.messages];
  const records: ToolCallRecord[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    if (input.signal?.aborted) {
      return { reply: "", toolCalls: records };
    }
    const genInput: ChatInput = {
      system: input.system,
      messages,
      temperature: TOOL_TEMPERATURE,
      maxTokens: TOOL_MAX_TOKENS,
      tools: nativeToolSpecs()
    };
    let raw: string;
    let nativeCalls: ParsedToolCall[] | null = null;
    let truncated = false;
    try {
      if (deps.generateChatV2) {
        const result = await deps.generateChatV2(settings, genInput, {
          onToken: input.onToken,
          signal: input.signal
        });
        raw = result.text;
        nativeCalls = result.toolCalls && result.toolCalls.length > 0 ? result.toolCalls : null;
        truncated = result.truncated === true;
      } else {
        raw = await (deps.generateChat ?? defaultGenerateChat)(settings, genInput, input.signal);
        nativeCalls = null;
      }
    } catch (error) {
      // An abort surfaces here as a thrown error — treat it as a clean stop.
      if (input.signal?.aborted) return { reply: "", toolCalls: records };
      // Nothing executed or queued yet: surface the provider error (bad key,
      // rate limit, offline) instead of dissolving it into an empty reply.
      if (records.length === 0) throw error;
      // Provider failure mid-loop with writes already made or queued: stop
      // iterating and fall through to the catch-guarded final fallback so
      // those writes still surface on cards.
      break;
    }

    // The signal may have aborted *during* generation; don't run tool calls
    // (especially writes) the user already cancelled.
    if (input.signal?.aborted) return { reply: raw.trim(), toolCalls: records };

    const isNative = nativeCalls !== null;
    const parsedCalls = nativeCalls ?? parseToolCalls(raw);
    if (!parsedCalls) {
      input.onStreamStep?.(step, "final");
      return { reply: raw.trim(), toolCalls: records };
    }
    const calls = ensureCallIds(parsedCalls, step);

    // Replay this turn to the model in its native tool protocol when the calls
    // came through the provider's function-calling API; fall back to the JSON
    // text emulation otherwise. Native replay keeps the model's own reasoning
    // format intact, which measurably improves multi-step coherence.
    const pushExchange = (
      assistantCalls: (ParsedToolCall & { id: string })[],
      results: { id: string; name: string; content: string }[],
      followUp: string
    ) => {
      if (isNative) {
        messages.push({
          role: "assistant",
          content: raw.trim(),
          toolCalls: assistantCalls.map((call) => ({ id: call.id, name: call.name, args: call.args }))
        });
        messages.push({ role: "user", content: followUp, toolResults: results });
        return;
      }
      const assistantContent =
        raw && raw.trim().length > 0
          ? raw
          : JSON.stringify({ tool_calls: assistantCalls.map((c) => ({ name: c.name, args: c.args })) });
      messages.push({ role: "assistant", content: assistantContent });
      messages.push({
        role: "user",
        content: `Tool results:\n${results.map((r) => r.content).join("\n")}\n\n${followUp}`
      });
    };

    // The response hit the output-token cap mid-tool-turn: the calls (or their
    // args) may be incomplete. Executing them risks running half-specified
    // writes — feed the truncation back instead and let the model re-issue.
    if (truncated) {
      input.onStreamStep?.(step, "reasoning");
      pushExchange(
        calls,
        calls.map((call) => ({
          id: call.id,
          name: call.name,
          content: `${call.name}: not executed — your response was cut off at the output-token limit, so this call may be incomplete.`
        })),
        "Your last response was truncated. Re-issue the needed tool calls more concisely (or split the work into smaller steps)."
      );
      continue;
    }

    const clarifyCall = calls.find((call) => call.name === "clarify");
    if (clarifyCall) {
      const parsed = toolByName("clarify")?.parameters.safeParse(clarifyCall.args);
      if (parsed?.success) {
        const data = parsed.data as { question: string; options?: string[] };
        const options = data.options ?? [];
        const reply =
          options.length > 0 ? `${data.question}\n\n${options.map((opt) => `- ${opt}`).join("\n")}` : data.question;
        input.onStreamStep?.(step, "final");
        return { reply, toolCalls: records };
      }
    }

    const programCall = calls.find((call) => call.name === "execute_program");
    if (programCall) {
      input.onStreamStep?.(step, "reasoning");
      const code = (programCall.args as { code?: unknown })?.code;
      if (typeof code !== "string" || code.trim().length === 0) {
        pushExchange(
          [programCall],
          [{ id: programCall.id, name: "execute_program", content: "execute_program: missing or empty `code` string argument." }],
          "Continue, or give your final answer."
        );
        continue;
      }
      input.onStep?.("Running a program...");
      const hostTools = buildHostTools(input.deps, input.level, records);
      const ptc = await runProgram(code, {
        tools: hostTools,
        signal: input.signal,
        timeoutMs: PROGRAM_TIMEOUT_MS,
        maxCalls: PROGRAM_MAX_CALLS
      });
      const callLines = ptc.calls.map(
        (call) => `  - ${call.name}: ${call.error ? `error - ${call.error}` : "ok"}`
      );
      const programFeedback = ptc.ok
        ? [
            `execute_program: ok. return value: ${JSON.stringify(ptc.returnValue ?? null)}`,
            ...(ptc.logs.length > 0 ? [`logs:`, ...ptc.logs.map((line) => `  ${line}`)] : []),
            ...(callLines.length > 0 ? [`tool calls made:`, ...callLines] : [])
          ].join("\n")
        : `execute_program: FAILED - ${ptc.error}${callLines.length > 0 ? `\ntool calls made:\n${callLines.join("\n")}` : ""}`;
      pushExchange(
        [programCall],
        [{ id: programCall.id, name: "execute_program", content: programFeedback }],
        "Continue, or give your final answer."
      );
      continue;
    }

    input.onStreamStep?.(step, "reasoning");

    const feedback: string[] = new Array(calls.length).fill("");
    const readIndices: number[] = [];
    calls.forEach((call, idx) => {
      const tool = toolByName(call.name);
      if (!tool) {
        feedback[idx] = `${call.name}: unknown tool`;
        return;
      }
      // Streamed argument JSON that didn't parse — never execute: for tools
      // whose args are all optional, {} would "validate" and run with defaults
      // the model never chose.
      if (call.argsInvalid) {
        feedback[idx] = `${call.name}: FAILED - arguments were not valid JSON (likely a garbled or cut-off response); re-issue this call with complete args`;
        return;
      }
      if (tool.category === "read") readIndices.push(idx);
    });

    await Promise.all(
      readIndices.map(async (idx) => {
        const call = calls[idx];
        const tool = toolByName(call.name)!;
        input.onStep?.(`Looking up ${call.name}...`);
        const parsed = tool.parameters.safeParse(call.args);
        if (!parsed.success) {
          feedback[idx] = `${call.name}: invalid args - ${parsed.error.issues[0]?.message ?? "bad args"}`;
          return;
        }
        const result = await tool.execute(call.args, input.deps);
        feedback[idx] = `${call.name}: ${result.ok ? result.summary : result.error}`;
      })
    );

    for (let idx = 0; idx < calls.length; idx++) {
      const call = calls[idx];
      const tool = toolByName(call.name);
      if (!tool || tool.category === "read" || call.argsInvalid) continue;

      const parsed = tool.parameters.safeParse(call.args);
      if (!parsed.success) {
        feedback[idx] = `${call.name}: invalid args - ${parsed.error.issues[0]?.message ?? "bad args"}`;
        continue;
      }

      const display = describeToolCallForDisplay(call.name, parsed.data, input.deps.store.getAllTasks());
      const base: ToolCallRecord = {
        id: createId("tc"),
        name: call.name,
        args: call.args,
        category: "write",
        destructive: isDestructive(tool, parsed.data),
        summary: display.summary,
        targetTitle: display.targetTitle,
        status: "pending"
      };

      if (needsConfirm(tool, input.level, parsed.data)) {
        records.push({ ...base, status: "pending" });
        feedback[idx] = `${call.name}: queued for the user's confirmation (not applied yet)`;
        continue;
      }

      const result = await tool.execute(call.args, input.deps);
      if (result.ok) {
        const undo = result.undo;
        records.push({
          ...base,
          status: "executed",
          summary: result.summary,
          result: result.summary,
          undo,
          expectedUpdatedAt: expectedUpdatedAtFor({ undo }, input.deps)
        });
        feedback[idx] = `${call.name}: ${result.summary}`;
      } else {
        records.push({ ...base, status: "failed", error: result.error, result: result.error });
        feedback[idx] = `${call.name}: FAILED - ${result.error}`;
      }
    }

    const anyFailed = feedback.some((line) => / FAILED -/.test(line));
    // Nudge a quick self-check: stop when the goal is met, fix course when a step
    // failed — rather than calling tools out of momentum.
    const reflect = anyFailed
      ? "A step failed above. Decide whether to adjust and retry, or explain the blocker — don't repeat the same failing call."
      : "If the user's goal is now met, give your final answer; otherwise continue with the next needed step.";
    pushExchange(
      calls,
      calls.map((call, idx) => ({ id: call.id, name: call.name, content: feedback[idx] })),
      reflect
    );
  }

  const finalGenInput: ChatInput = {
    system: input.system,
    messages: [...messages, { role: "user", content: "Give your final answer now (plain text, no tool calls)." }],
    temperature: TOOL_TEMPERATURE,
    maxTokens: TOOL_MAX_TOKENS
  };
  let finalRaw: string;
  try {
    if (deps.generateChatV2) {
      const r = await deps.generateChatV2(settings, finalGenInput, { onToken: input.onToken, signal: input.signal });
      finalRaw = r.text;
    } else {
      finalRaw = await (deps.generateChat ?? defaultGenerateChat)(settings, finalGenInput, input.signal);
    }
  } catch (error) {
    if (input.signal?.aborted) return { reply: "", toolCalls: records };
    // With no writes to surface there is nothing worth returning — let the
    // caller show the provider error instead of a blank reply.
    if (records.length === 0) throw error;
    finalRaw = "";
  }
  input.onStreamStep?.(MAX_STEPS, "final");
  return { reply: finalRaw.trim(), toolCalls: records };
}
