import { generateChat as defaultGenerateChat } from "../chatClient";
import type { AiSettings, ChatInput, ChatTurn } from "../providers";
import { needsConfirm } from "./agentTools/permissions";
import { nativeToolSpecs, toolByName } from "./agentTools/registry";
import type { AgentToolDeps, PermissionLevel, ToolCallRecord } from "./agentTools/types";
import { parseToolCalls } from "./responseParser";
import { createId } from "../../../utils/id";

export const TOOL_TEMPERATURE = 0.3;
export const MAX_STEPS = 12;

export type ToolLoopInput = {
  settings: AiSettings;
  system: string;
  messages: ChatTurn[];
  level: PermissionLevel;
  deps: AgentToolDeps;
  onStep?: (label: string) => void;
};

export type ToolLoopDeps = { generateChat: (settings: AiSettings, input: ChatInput) => Promise<string> };

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
    const raw = await deps.generateChat(settings, {
      system: input.system,
      messages,
      temperature: TOOL_TEMPERATURE,
      tools: nativeToolSpecs()
    });
    const calls = parseToolCalls(raw);
    if (!calls) return { reply: raw.trim(), toolCalls: records };

    const feedback: string[] = [];
    for (const call of calls) {
      const tool = toolByName(call.name);
      if (!tool) {
        feedback.push(`${call.name}: unknown tool`);
        continue;
      }

      const parsed = tool.parameters.safeParse(call.args);
      if (!parsed.success) {
        feedback.push(`${call.name}: invalid args - ${parsed.error.issues[0]?.message ?? "bad args"}`);
        continue;
      }

      if (tool.category === "read") {
        const result = await tool.execute(call.args, input.deps);
        feedback.push(`${call.name}: ${result.ok ? result.summary : result.error}`);
        input.onStep?.(`Looking up ${call.name}...`);
        continue;
      }

      const base: ToolCallRecord = {
        id: createId("tc"),
        name: call.name,
        args: call.args,
        category: "write",
        destructive: tool.destructive,
        summary: call.name,
        status: "pending"
      };

      if (needsConfirm(tool, input.level)) {
        records.push({ ...base, status: "pending" });
        feedback.push(`${call.name}: queued for the user's confirmation (not applied yet)`);
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
        feedback.push(`${call.name}: ${result.summary}`);
      } else {
        records.push({ ...base, status: "failed", error: result.error, result: result.error });
        feedback.push(`${call.name}: FAILED - ${result.error}`);
      }
    }

    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `Tool results:\n${feedback.join("\n")}\n\nContinue, or give your final answer.`
    });
  }

  const finalRaw = await deps
    .generateChat(settings, {
      system: input.system,
      messages: [...messages, { role: "user", content: "Give your final answer now (plain text, no tool calls)." }],
      temperature: TOOL_TEMPERATURE
    })
    .catch(() => "");
  return { reply: finalRaw.trim(), toolCalls: records };
}
