import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Context } from "./context.js";
import { toolModules } from "./tools/index.js";

export const SERVER_NAME = "yolo-mcp";
export const SERVER_VERSION = "0.1.0";

/**
 * Build an McpServer with every registered tool wired to the given context.
 * Kept pure (no transport, no DB open) so tests can construct it directly.
 */
export function buildServer(ctx: Context): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const tool of toolModules) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic registry seam
      (args: any) => tool.handler(args, ctx)
    );
  }

  return server;
}
