import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Context } from "./context.js";
import { toolModulesFor } from "./tools/index.js";

export const SERVER_NAME = "yolo-mcp";
export const SERVER_VERSION = "0.2.0";

export interface BuildOptions {
  /** Register only read tools (YOLO_MCP_READONLY). Defaults to full read-write. */
  readonly?: boolean;
}

/**
 * Build an McpServer with every registered tool wired to the given context.
 * Kept pure (no transport, no DB open) so tests can construct it directly.
 */
export function buildServer(ctx: Context, options: BuildOptions = {}): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const tool of toolModulesFor({ readonly: options.readonly ?? false })) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        annotations: tool.annotations,
        inputSchema: tool.inputSchema
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic registry seam
      (args: any) => tool.handler(args, ctx)
    );
  }

  return server;
}
