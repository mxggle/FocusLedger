import { createId } from "../../../../utils/id";
import { isDestructive, needsConfirm, queuedWriteError } from "../agentTools/permissions";
import { AGENT_TOOLS } from "../agentTools/registry";
import type { AgentTool, AgentToolDeps, PermissionLevel, ToolCallRecord, UndoOp } from "../agentTools/types";
import { describeToolCallForDisplay } from "../toolDisplay";
import type { HostTool } from "./types";

function expectedUpdatedAtFor(undo: UndoOp | undefined, deps: AgentToolDeps): string | undefined {
  if (!undo || undo.kind !== "restore_task") return undefined;
  return deps.store.getAllTasks().find((task) => task.id === undo.taskId)?.updated_at;
}

/** Tools that are loop-level control flow, not callable from inside a program. */
const PROGRAM_EXCLUDED = new Set(["clarify", "execute_program"]);

/**
 * Adapt the live agent-tool registry into sandbox HostTools for a PTC program.
 * Reads execute directly; writes respect the same permission gate as the JSON
 * loop (deferred → pending card) and record reversible undo ops into `records`.
 * Returns JSON-serializable result objects (never throws into the sandbox).
 */
export function buildHostTools(deps: AgentToolDeps, level: PermissionLevel, records: ToolCallRecord[]): HostTool[] {
  return AGENT_TOOLS.filter((tool) => !PROGRAM_EXCLUDED.has(tool.name)).map((tool: AgentTool) => ({
    name: tool.name,
    async execute(rawArgs: unknown): Promise<unknown> {
      const parsed = tool.parameters.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: `invalid args - ${parsed.error.issues[0]?.message ?? "bad args"}` };
      }

      if (tool.category === "read") {
        const result = await tool.execute(rawArgs, deps);
        return result.ok ? { ok: true, summary: result.summary, data: result.data ?? null } : { ok: false, error: result.error };
      }

      const display = describeToolCallForDisplay(tool.name, parsed.data, deps.store.getAllTasks());
      const base: ToolCallRecord = {
        id: createId("tc"),
        name: tool.name,
        args: rawArgs,
        category: "write",
        destructive: isDestructive(tool, parsed.data),
        summary: display.summary,
        targetTitle: display.targetTitle,
        status: "pending"
      };

      if (needsConfirm(tool, level, parsed.data)) {
        // Same gate as the JSON loop: an unresolvable task_id fails now, in the
        // program, instead of on the user's Apply click.
        const unqueueable = queuedWriteError(parsed.data, deps);
        if (unqueueable) {
          records.push({ ...base, status: "failed", error: unqueueable, result: unqueueable });
          return { ok: false, error: unqueueable };
        }
        records.push({ ...base, status: "pending" });
        return { ok: true, queued: true, summary: "queued for the user's confirmation (not applied yet)" };
      }

      const result = await tool.execute(rawArgs, deps);
      if (result.ok) {
        const undo = result.undo;
        records.push({
          ...base,
          status: "executed",
          summary: result.summary,
          result: result.summary,
          undo,
          expectedUpdatedAt: expectedUpdatedAtFor(undo, deps)
        });
        return { ok: true, summary: result.summary };
      }

      records.push({ ...base, status: "failed", error: result.error, result: result.error });
      return { ok: false, error: result.error };
    }
  }));
}
