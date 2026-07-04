import { z } from "zod";
import { countTermHits, extractTerms } from "../normalizeKey";
import type { RecallEntry } from "../recallHistory";
import { MAX_SEARCH_RESULTS } from "./readHelpers";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({ query: z.string().min(1) });

function recallSnippet(entry: RecallEntry): string {
  const parts: string[] = [];
  if (entry.note) parts.push(entry.note);
  if (entry.blocker) parts.push(`blocked - ${entry.blocker}`);
  if (entry.nextAction) parts.push(`next - ${entry.nextAction}`);
  const where = entry.category ? ` (${entry.category})` : "";
  return `- [${entry.date}] "${entry.taskTitle}"${where}: ${parts.join("; ")}`;
}

export const recallTool: AgentTool = {
  name: "recall",
  category: "read",
  destructive: false,
  description: "Search logged reflections for past work, lessons, recurring blockers, or next actions.",
  paramsHint: "query (required, keywords)",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      if (deps.history.length === 0) return { ok: true, summary: "recall: no logged reflections yet to search." };
      const terms = extractTerms(args.query);
      const scored = deps.history
        .map((entry) => {
          const haystack = `${entry.taskTitle} ${entry.category ?? ""} ${entry.note ?? ""} ${entry.blocker ?? ""} ${entry.nextAction ?? ""}`;
          return { entry, score: countTermHits(haystack, terms) };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SEARCH_RESULTS);

      if (scored.length === 0) return { ok: true, summary: `recall("${args.query}"): no matching history.`, data: [] };
      return {
        ok: true,
        summary: [`recall("${args.query}") found ${scored.length}:`, ...scored.map(({ entry }) => recallSnippet(entry))].join(
          "\n"
        ),
        data: scored.map(({ entry }) => entry)
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid recall args" };
    }
  }
};
