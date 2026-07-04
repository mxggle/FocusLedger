import { z } from "zod";
import { countTermHits, extractTerms } from "../normalizeKey";
import { MAX_SEARCH_RESULTS } from "./readHelpers";
import type { AgentTool, AgentToolDeps, ConversationRecallEntry, ToolResult } from "./types";

const schema = z.object({ query: z.string().min(1) });

function snippet(entry: ConversationRecallEntry): string {
  const date = entry.createdAt.slice(0, 10);
  const who = entry.role === "user" ? "you" : "assistant";
  const text = entry.content.replace(/\s+/g, " ").trim().slice(0, 200);
  return `- [${date}] ${who}: ${text}`;
}

export const recallConversationsTool: AgentTool = {
  name: "recall_conversations",
  category: "read",
  destructive: false,
  description:
    "Search earlier assistant conversations (across past sessions) for what was previously discussed, decided, or asked. Use when the user refers to something from before.",
  paramsHint: "query (required, keywords)",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      const conversations = deps.conversations ?? [];
      if (conversations.length === 0) {
        return { ok: true, summary: "recall_conversations: no earlier conversations to search yet." };
      }
      const terms = extractTerms(args.query);
      const scored = conversations
        .map((entry) => ({ entry, score: countTermHits(entry.content, terms) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SEARCH_RESULTS);

      if (scored.length === 0) {
        return { ok: true, summary: `recall_conversations("${args.query}"): no matching past discussion.`, data: [] };
      }
      return {
        ok: true,
        summary: [
          `recall_conversations("${args.query}") found ${scored.length}:`,
          ...scored.map(({ entry }) => snippet(entry))
        ].join("\n"),
        data: scored.map(({ entry }) => entry)
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid recall_conversations args" };
    }
  }
};
