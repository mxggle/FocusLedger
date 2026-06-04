import Database, { type Database as SqliteDatabase } from "better-sqlite3";

export type { SqliteDatabase };

export interface OpenOptions {
  path: string;
  /** Open the connection read-only. Defaults to true — v1 never mutates data. */
  readonly?: boolean;
}

/**
 * Open the Yolo SQLite database.
 *
 * v1 opens read-only so an agent cannot mutate the user's data even if a write
 * path is added by mistake. A `busy_timeout` lets reads wait out a write lock
 * held by the running desktop app instead of failing immediately.
 */
export function openDatabase({ path, readonly = true }: OpenOptions): SqliteDatabase {
  const db = new Database(path, { readonly, fileMustExist: readonly });
  db.pragma("busy_timeout = 5000");
  return db;
}
