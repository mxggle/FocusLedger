import Database from "@tauri-apps/plugin-sql";
import { runMigrations } from "./migrations";
import type { SqlDatabase } from "./types";

const DATABASE_URL = "sqlite:focusledger.db";

let databasePromise: Promise<SqlDatabase> | null = null;

export async function getDatabase(): Promise<SqlDatabase> {
  if (!databasePromise) {
    databasePromise = Database.load(DATABASE_URL).then(async (db) => {
      await runMigrations(db);
      return db;
    });
  }

  return databasePromise;
}

export async function initializeDatabase(): Promise<SqlDatabase> {
  return getDatabase();
}
