import { z } from "zod";
import { defineTool, errorResult, jsonResult } from "./types.js";
import { isValidDateKey, toDateKey } from "../util/date.js";

export const dailySummaryTool = defineTool({
  name: "daily_summary",
  title: "Daily summary",
  description:
    "Summarize one day: total focus time, time per category, tasks completed/dropped, and estimated-vs-actual minutes. Defaults to today.",
  inputSchema: {
    date: z.string().optional().describe("YYYY-MM-DD; defaults to today")
  },
  handler: (args, ctx) => {
    const date = args.date ?? toDateKey();
    if (!isValidDateKey(date)) {
      return errorResult(`Invalid date (expected YYYY-MM-DD): ${date}`);
    }
    return jsonResult(ctx.summary.forDate(date));
  }
});
