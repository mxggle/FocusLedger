import { z } from "zod";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({});

export const listCategoriesTool: AgentTool = {
  name: "list_categories",
  category: "read",
  destructive: false,
  description: "List available task categories/projects by name and id.",
  paramsHint: "{}",
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      schema.parse(rawArgs);
      const categories = deps.store.getCategories();
      const summary =
        categories.length === 0
          ? "list_categories: no categories."
          : ["list_categories:", ...categories.map((category) => `- ${category.name} [${category.id}]`)].join("\n");
      return { ok: true, summary, data: categories };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid list_categories args" };
    }
  }
};
