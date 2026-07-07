import { z } from "zod";
import { countTermHits, extractTerms } from "../normalizeKey";
import { MAX_SEARCH_RESULTS } from "./readHelpers";
import { shortTaskId } from "./taskRef";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({ query: z.string().min(1) });

export const searchTasksTool: AgentTool = {
  name: "search_tasks",
  category: "read",
  destructive: false,
  description: "Keyword search all tasks by title and description before creating or editing.",
  paramsHint: "query (required, keywords)",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      const terms = extractTerms(args.query);
      const scored = deps.store
        .getAllTasks()
        .map((task) => {
          const score = countTermHits(`${task.title} ${task.description ?? ""}`, terms);
          return { task, score };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SEARCH_RESULTS);

      if (scored.length === 0) return { ok: true, summary: `search_tasks("${args.query}"): no matching tasks.`, data: [] };
      const lines = scored.map(({ task }) => `- [${shortTaskId(task.id)}] "${task.title}" (${task.status}${task.due_date ? `, due ${task.due_date}` : ""})`);
      return {
        ok: true,
        summary: [`search_tasks("${args.query}") found ${scored.length}:`, ...lines].join("\n"),
        data: scored.map(({ task }) => task)
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid search_tasks args" };
    }
  }
};
