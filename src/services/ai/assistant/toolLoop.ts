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
  ) => Promise<{ text: string; toolCalls: ParsedToolCall[] }>;
};

export type ToolLoopResult = { reply: string; toolCalls: ToolCallRecord[] };

function expectedUpdatedAtFor(rec: Pick<ToolCallRecord, "undo">, deps: AgentToolDeps): string | undefined {
  if (!rec.undo || rec.undo.kind !== "restore_task") return undefined;
  const taskId = rec.undo.taskId;
  return deps.store.getAllTasks().find((task) => task.id === taskId)?.updated_at;
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
      tools: nativeToolSpecs()
    };
    let raw: string;
    let nativeCalls: ParsedToolCall[] | null = null;
    try {
      if (deps.generateChatV2) {
        const { text, toolCalls } = await deps.generateChatV2(settings, genInput, {
          onToken: input.onToken,
          signal: input.signal
        });
        raw = text;
        nativeCalls = toolCalls && toolCalls.length > 0 ? toolCalls : null;
      } else {
        raw = await (deps.generateChat ?? defaultGenerateChat)(settings, genInput, input.signal);
        nativeCalls = null;
      }
    } catch {
      // An abort surfaces here as a thrown error — treat it as a clean stop.
      if (input.signal?.aborted) return { reply: "", toolCalls: records };
      // Transient provider failure mid-loop: stop iterating and fall through to
      // the catch-guarded final fallback so any executed writes still surface.
      break;
    }

    // The signal may have aborted *during* generation; don't run tool calls
    // (especially writes) the user already cancelled.
    if (input.signal?.aborted) return { reply: raw.trim(), toolCalls: records };

    const calls = nativeCalls ?? parseToolCalls(raw);
    if (!calls) {
      input.onStreamStep?.(step, "final");
      return { reply: raw.trim(), toolCalls: records };
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
        messages.push({ role: "assistant", content: JSON.stringify({ tool_calls: [{ name: "execute_program", args: programCall.args }] }) });
        messages.push({
          role: "user",
          content: "Program result:\nexecute_program: missing or empty `code` string argument.\n\nContinue, or give your final answer."
        });
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
      messages.push({ role: "assistant", content: JSON.stringify({ tool_calls: [{ name: "execute_program", args: { code } }] }) });
      messages.push({ role: "user", content: `Program result:\n${programFeedback}\n\nContinue, or give your final answer.` });
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
      if (!tool || tool.category === "read") continue;

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

    const assistantContent =
      raw && raw.trim().length > 0
        ? raw
        : JSON.stringify({ tool_calls: calls.map((c) => ({ name: c.name, args: c.args })) });
    const anyFailed = feedback.some((line) => / FAILED -/.test(line));
    // Nudge a quick self-check: stop when the goal is met, fix course when a step
    // failed — rather than calling tools out of momentum.
    const reflect = anyFailed
      ? "A step failed above. Decide whether to adjust and retry, or explain the blocker — don't repeat the same failing call."
      : "If the user's goal is now met, give your final answer; otherwise continue with the next needed step.";
    messages.push({ role: "assistant", content: assistantContent });
    messages.push({
      role: "user",
      content: `Tool results:\n${feedback.join("\n")}\n\n${reflect}`
    });
  }

  const finalGenInput: ChatInput = {
    system: input.system,
    messages: [...messages, { role: "user", content: "Give your final answer now (plain text, no tool calls)." }],
    temperature: TOOL_TEMPERATURE
  };
  let finalRaw: string;
  if (deps.generateChatV2) {
    const r = await deps
      .generateChatV2(settings, finalGenInput, { onToken: input.onToken, signal: input.signal })
      .catch(() => ({ text: "", toolCalls: [] as ParsedToolCall[] }));
    finalRaw = r.text;
  } else {
    finalRaw = await (deps.generateChat ?? defaultGenerateChat)(settings, finalGenInput, input.signal).catch(() => "");
  }
  input.onStreamStep?.(MAX_STEPS, "final");
  return { reply: finalRaw.trim(), toolCalls: records };
}
