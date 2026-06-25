import { generateChat as defaultGenerateChat } from "../chatClient";
import type { AiSettings, ChatInput, ChatTurn } from "../providers";
import { needsConfirm } from "./agentTools/permissions";
import { nativeToolSpecs, toolByName } from "./agentTools/registry";
import type { AgentToolDeps, PermissionLevel, ToolCallRecord } from "./agentTools/types";
import { parseToolCalls, type ParsedToolCall } from "./responseParser";
import { createId } from "../../../utils/id";
import { describeToolCallForDisplay } from "./toolDisplay";

export const TOOL_TEMPERATURE = 0.3;
export const MAX_STEPS = 12;

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

    const calls = nativeCalls ?? parseToolCalls(raw);
    if (!calls) {
      input.onStreamStep?.(step, "final");
      return { reply: raw.trim(), toolCalls: records };
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
        destructive: tool.destructive,
        summary: display.summary,
        targetTitle: display.targetTitle,
        status: "pending"
      };

      if (needsConfirm(tool, input.level)) {
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
    messages.push({ role: "assistant", content: assistantContent });
    messages.push({
      role: "user",
      content: `Tool results:\n${feedback.join("\n")}\n\nContinue, or give your final answer.`
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
