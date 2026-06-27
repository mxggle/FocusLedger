import { z } from "zod";
import { computeDayBriefing } from "../dayBriefing";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({ scope: z.string().optional() });

export const dailySummaryTool: AgentTool = {
  name: "daily_summary",
  category: "read",
  destructive: false,
  description: "Return deterministic day load numbers computed in TypeScript.",
  paramsHint: 'scope optional ("today" or YYYY-MM-DD; L1 computes from current context)',
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      const scope = args.scope ?? "today";
      if (scope !== "today" && !/^\d{4}-\d{2}-\d{2}$/.test(scope)) {
        return { ok: false, error: 'scope must be "today" or YYYY-MM-DD' };
      }
      const existing = deps.ctx.briefing;
      const targetMinutes = existing?.targetMinutes ?? 0;
      const briefing = existing ?? computeDayBriefing(deps.ctx.tasks, deps.ctx.backlog.length, targetMinutes);
      const summary = [
        `daily_summary(${scope}): ${briefing.status}`,
        `open ${briefing.openCount}, done ${briefing.doneCount}, backlog ${briefing.backlogCount}`,
        `scheduled ${briefing.scheduledMinutes}m, target ${briefing.targetMinutes}m, overcommit ${briefing.overcommitMinutes}m`
      ].join("; ");
      return { ok: true, summary, data: briefing };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid daily_summary args" };
    }
  }
};
