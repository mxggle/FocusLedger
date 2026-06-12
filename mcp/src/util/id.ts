import { randomUUID } from "node:crypto";

/**
 * Prefixed ids matching the desktop app's `createId` (`task_<uuid>`,
 * `entry_<uuid>`), so rows written by the MCP server are indistinguishable
 * from rows written by the app.
 */
export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
