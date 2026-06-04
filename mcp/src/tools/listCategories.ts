import { defineTool, jsonResult } from "./types.js";

export const listCategoriesTool = defineTool({
  name: "list_categories",
  title: "List categories",
  description: "List all task categories (id, name, color). Useful for resolving category filters.",
  inputSchema: {},
  handler: (_args, ctx) => {
    const categories = ctx.categories.list();
    return jsonResult({ count: categories.length, categories });
  }
});
