import Database, { type Database as SqliteDatabase } from "better-sqlite3";

/**
 * Minimal mirror of the desktop app's schema — just the tables the MCP server
 * reads. Kept here (not in src) so the server never creates tables: it is a
 * read-only consumer of a DB the app owns.
 */
const SCHEMA = `
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    estimated_minutes INTEGER,
    due_date TEXT,
    template_id TEXT,
    planned_start_time TEXT,
    planned_end_time TEXT,
    sort_order INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    dropped_at TEXT
  );
  CREATE TABLE time_entries (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT,
    duration_seconds INTEGER,
    note TEXT,
    blocker TEXT,
    next_action TEXT,
    completion_rate INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export function createTestDb(): SqliteDatabase {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  return db;
}

const NOW = "2026-06-04T00:00:00.000Z";

export function insertCategory(
  db: SqliteDatabase,
  category: { id: string; name: string; color?: string | null }
): void {
  db.prepare(
    "INSERT INTO categories (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(category.id, category.name, category.color ?? null, NOW, NOW);
}

export interface TaskSeed {
  id: string;
  title?: string;
  category_id?: string | null;
  status?: string;
  priority?: string;
  estimated_minutes?: number | null;
  due_date?: string | null;
  completed_at?: string | null;
  dropped_at?: string | null;
  created_at?: string;
}

export function insertTask(db: SqliteDatabase, task: TaskSeed): void {
  db.prepare(
    `INSERT INTO tasks (
      id, title, description, category_id, status, priority, estimated_minutes,
      due_date, template_id, planned_start_time, planned_end_time, sort_order,
      created_at, updated_at, completed_at, dropped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    task.id,
    task.title ?? `Task ${task.id}`,
    null,
    task.category_id ?? null,
    task.status ?? "todo",
    task.priority ?? "medium",
    task.estimated_minutes ?? null,
    task.due_date ?? null,
    null,
    null,
    null,
    null,
    task.created_at ?? NOW,
    NOW,
    task.completed_at ?? null,
    task.dropped_at ?? null
  );
}

export interface EntrySeed {
  id: string;
  task_id: string;
  start_at: string;
  end_at?: string | null;
  duration_seconds?: number | null;
  note?: string | null;
}

export function insertEntry(db: SqliteDatabase, entry: EntrySeed): void {
  db.prepare(
    `INSERT INTO time_entries (
      id, task_id, start_at, end_at, duration_seconds, note, blocker,
      next_action, completion_rate, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.id,
    entry.task_id,
    entry.start_at,
    entry.end_at ?? null,
    entry.duration_seconds ?? null,
    entry.note ?? null,
    null,
    null,
    null,
    entry.start_at,
    entry.end_at ?? entry.start_at
  );
}
