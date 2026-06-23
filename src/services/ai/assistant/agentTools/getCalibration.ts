import { z } from "zod";
import type { CalibrationStat } from "../../../retrospect/types";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({ category: z.string().optional() });

function describeStat(stat: CalibrationStat): string {
  const pct = Math.round(stat.ratio * 100);
  const flag = stat.confidence === "low" ? " (low confidence - little history)" : "";
  return `${stat.scope}: actual is ${pct}% of estimate (ratio ${stat.ratio.toFixed(2)}, ${stat.sampleSize} tasks)${flag}`;
}

export const getCalibrationTool: AgentTool = {
  name: "get_calibration",
  category: "read",
  destructive: false,
  description: "Read deterministic estimate-vs-actual calibration before setting estimates.",
  paramsHint: "category optional name; omit for overall ratio",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      const calibration = deps.insights?.calibration;
      if (!calibration?.overall) {
        return { ok: true, summary: "get_calibration: no estimate history yet; use your own judgement." };
      }
      const wanted = (args.category ?? "").trim().toLowerCase();
      if (wanted) {
        const match = calibration.byCategory.find((stat) => stat.scope.toLowerCase() === wanted);
        if (match) return { ok: true, summary: `get_calibration - ${describeStat(match)}`, data: match };
      }
      return {
        ok: true,
        summary: `get_calibration - ${describeStat(calibration.overall)} (overall; no specific category match)`,
        data: calibration.overall
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid get_calibration args" };
    }
  }
};
