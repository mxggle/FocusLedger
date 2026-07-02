import { z } from "zod";
import { revertToolCall } from "./revert";
import type { AgentTool, AgentToolDeps, SessionToolCall, ToolResult } from "./types";

const schema = z.object({ scope: z.enum(["last", "all"]).optional() });

function revertible(entries: SessionToolCall[]): SessionToolCall[] {
  return entries.filter(({ call }) => call.status === "executed" && call.undo);
}

function labelFor(entry: SessionToolCall): string {
  const undo = entry.call.undo;
  if (undo?.kind === "restore_task") return `"${undo.before.title}"`;
  return entry.call.summary;
}

export const revertChangesTool: AgentTool = {
  name: "revert_changes",
  category: "write",
  destructive: false,
  description:
    'Undo changes YOU made earlier in this conversation, restoring the affected tasks to their previous state. scope "last" (default) reverts the most recent batch of applied changes; "all" reverts every applied change in this conversation. Use whenever the user asks to revert, undo, or roll back what you did — do not reconstruct inverse edits by hand.',
  paramsHint: 'scope optional ("last"|"all", default "last")',
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      const scope = args.scope ?? "last";
      const eligible = revertible(deps.sessionToolCalls ?? []);
      if (eligible.length === 0) {
        return {
          ok: true,
          summary: "revert_changes: nothing to revert — no applied changes remain in this conversation."
        };
      }
      const lastMessageId = eligible[eligible.length - 1].messageId;
      const chosen = scope === "all" ? eligible : eligible.filter((entry) => entry.messageId === lastMessageId);

      // Unwind newest-first so stacked edits to the same task land on its oldest state.
      const lines: string[] = [];
      let failed = 0;
      for (const entry of [...chosen].reverse()) {
        const result = await revertToolCall(entry.call, deps.store);
        if (result.ok) {
          deps.onReverted?.(entry.messageId, entry.call.id);
          lines.push(`- reverted: ${labelFor(entry)}`);
        } else {
          failed += 1;
          lines.push(`- FAILED: ${labelFor(entry)} — ${result.message ?? "could not revert"}`);
        }
      }
      const reverted = chosen.length - failed;
      const head =
        failed === 0
          ? `revert_changes: reverted ${reverted} change${reverted === 1 ? "" : "s"}.`
          : `revert_changes: reverted ${reverted} of ${chosen.length} changes.`;
      return { ok: true, summary: [head, ...lines].join("\n") };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid revert_changes args" };
    }
  }
};
