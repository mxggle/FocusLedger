#!/usr/bin/env node
import { existsSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveDatabasePath } from "./config.js";
import { openDatabase } from "./db/database.js";
import { createContext } from "./context.js";
import { buildServer, SERVER_NAME } from "./server.js";

// stdout is the MCP transport channel — all diagnostics must go to stderr.
function log(message: string): void {
  process.stderr.write(`[${SERVER_NAME}] ${message}\n`);
}

async function main(): Promise<void> {
  const dbPath = resolveDatabasePath();
  if (!existsSync(dbPath)) {
    throw new Error(
      `Yolo database not found at ${dbPath}. ` +
        "Launch the Yolo app at least once, or set YOLO_DB_PATH to the database file."
    );
  }

  const db = openDatabase({ path: dbPath, readonly: true });
  const ctx = createContext(db);
  const server = buildServer(ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready (db: ${dbPath})`);
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  log(`fatal: ${detail}`);
  process.exit(1);
});
