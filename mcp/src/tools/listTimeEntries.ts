import { z } from "zod";
import { defineTool, errorResult, jsonResult } from "./types.js";
import { endOfDateKey, isValidDateKey, startOfDateKey } from "../util/date.js";

export const listTimeEntriesTool = defineTool({
  name: "list_time_entries",
  title: "List time entries",
  description:
    "List tracked time sessions (with task and category) overlapping a window. Provide either `date` (a single YYYY-MM-DD day) or an explicit `start`/`end` ISO range.",
  annotations: { readOnlyHint: true, openWorldHint: false },
  inputSchema: {
    date: z.string().optional().describe("YYYY-MM-DD; a single day"),
    start: z.string().optional().describe("ISO timestamp; range start (inclusive)"),
    end: z.string().optional().describe("ISO timestamp; range end (exclusive)"),
    limit: z.number().int().positive().max(1000).optional().describe("Max entries to return")
  },
  handler: (args, ctx) => {
    let startIso: string;
    let endIso: string;

    if (args.date) {
      if (!isValidDateKey(args.date)) {
        return errorResult(`Invalid date (expected YYYY-MM-DD): ${args.date}`);
      }
      startIso = startOfDateKey(args.date).toISOString();
      endIso = endOfDateKey(args.date).toISOString();
    } else if (args.start && args.end) {
      startIso = args.start;
      endIso = args.end;
    } else {
      return errorResult("Provide either `date`, or both `start` and `end`.");
    }

    let entries = ctx.timeEntries.listForRange(startIso, endIso);
    if (args.limit) {
      entries = entries.slice(0, args.limit);
    }
    return jsonResult({ range: { start: startIso, end: endIso }, count: entries.length, entries });
  }
});
