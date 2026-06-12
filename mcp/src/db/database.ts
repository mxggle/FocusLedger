import Database, { type Database as SqliteDatabase } from "better-sqlite3";

export type { SqliteDatabase };

export interface OpenOptions {
  path: string;
  /** Open the connection read-only (set via YOLO_MCP_READONLY). Defaults to read-write. */
  readonly?: boolean;
}

/**
 * Open the Yolo SQLite database.
 *
 * `fileMustExist` is always on: the desktop app owns the database and its
 * schema — the server must never create an empty one. A `busy_timeout` lets
 * either side wait out a short write lock held by the other (the app keeps the
 * file in WAL mode, so one writer and many readers coexist).
 */
export function openDatabase({ path, readonly = false }: OpenOptions): SqliteDatabase {
  const db = new Database(path, { readonly, fileMustExist: true });
  db.pragma("busy_timeout = 5000");
  return db;
}
