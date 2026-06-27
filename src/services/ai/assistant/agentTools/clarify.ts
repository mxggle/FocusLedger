import { z } from "zod";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).max(6).optional()
});

export const clarifyTool: AgentTool = {
  name: "clarify",
  category: "read",
  destructive: false,
  description:
    "Ask the user ONE focused question when the request is ambiguous or under-specified, instead of guessing. Ends your turn; the user's answer arrives as the next message.",
  paramsHint: "question (required), options (optional suggested answers)",
  parameters: schema,
  async execute(rawArgs, _deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      return {
        ok: true,
        summary: args.question,
        data: { question: args.question, options: args.options ?? [] }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid clarify args" };
    }
  }
};
