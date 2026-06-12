import type { z, ZodRawShape } from "zod";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { Context } from "../context.js";

/**
 * A self-contained MCP tool. Drop a new file exporting one of these into
 * `tools/`, add it to the registry in `tools/index.ts`, and it is live — no
 * changes to the server wiring required. This is the feature-extension unit.
 */
export interface ToolModule<Shape extends ZodRawShape = ZodRawShape> {
  name: string;
  title: string;
  description: string;
  /** Tools that mutate the database; skipped when the server runs read-only. */
  writes?: boolean;
  /** MCP behaviour hints (readOnlyHint, destructiveHint, …) surfaced to clients. */
  annotations?: ToolAnnotations;
  inputSchema: Shape;
  handler: (args: z.infer<z.ZodObject<Shape>>, ctx: Context) => CallToolResult | Promise<CallToolResult>;
}

/**
 * A tool of any input shape — the element type for the heterogeneous registry.
 * Per-tool files keep full typing; only the registry boundary is generic.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolModule = ToolModule<any>;

/** Identity helper that preserves a tool's input-shape typing in its own file. */
export function defineTool<Shape extends ZodRawShape>(mod: ToolModule<Shape>): ToolModule<Shape> {
  return mod;
}

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
