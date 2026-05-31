import type { SqlDatabase } from "./types";
import { DEFAULT_SETTINGS } from "../types";

export const DEFAULT_CATEGORIES = [
  { id: "inbox", name: "Inbox", color: "#71717a" },
  { id: "job-hunting", name: "Job Hunting", color: "#2563eb" },
  { id: "japanese", name: "Japanese", color: "#16a34a" },
  { id: "english", name: "English", color: "#0891b2" },
  { id: "development", name: "Development", color: "#7c3aed" },
  { id: "life", name: "Life", color: "#ea580c" },
  { id: "reading", name: "Reading", color: "#9333ea" },
  { id: "health", name: "Health", color: "#dc2626" }
] as const;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    estimated_minutes INTEGER,
    due_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    dropped_at TEXT,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`,
  `CREATE TABLE IF NOT EXISTS time_entries (
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
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    estimated_minutes INTEGER,
    planned_start_time TEXT NOT NULL,
    planned_end_time TEXT,
    recurrence_type TEXT NOT NULL,
    recurrence_days TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`,
  `CREATE TABLE IF NOT EXISTS template_occurrences (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    date TEXT NOT NULL,
    task_id TEXT,
    skipped_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (template_id) REFERENCES task_templates(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_due_status ON tasks(due_date, status)`,
  `CREATE INDEX IF NOT EXISTS idx_task_templates_enabled ON task_templates(enabled)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_template_occurrences_date
    ON template_occurrences(template_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_time_entries_range ON time_entries(start_at, end_at)`,
  `UPDATE time_entries
    SET
      end_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      duration_seconds = MAX(0, CAST((julianday('now') - julianday(start_at)) * 86400 AS INTEGER)),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE end_at IS NULL
      AND id NOT IN (
        SELECT id FROM time_entries WHERE end_at IS NULL ORDER BY start_at DESC LIMIT 1
      )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_time_entry
    ON time_entries((end_at IS NULL))
    WHERE end_at IS NULL`
];

export async function runMigrations(db: SqlDatabase): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.execute(statement);
  }

  await ensureTaskScheduleColumns(db);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_tasks_template_due ON tasks(template_id, due_date)");
  await seedDefaultCategories(db);
  await seedDefaultSettings(db);
}

async function ensureTaskScheduleColumns(db: SqlDatabase): Promise<void> {
  const columns = await db.select<Array<{ name: string }>>("PRAGMA table_info(tasks)");
  const existing = new Set(columns.map((column) => column.name));
  const additions: Array<[string, string]> = [
    ["template_id", "ALTER TABLE tasks ADD COLUMN template_id TEXT"],
    ["planned_start_time", "ALTER TABLE tasks ADD COLUMN planned_start_time TEXT"],
    ["planned_end_time", "ALTER TABLE tasks ADD COLUMN planned_end_time TEXT"],
    ["sort_order", "ALTER TABLE tasks ADD COLUMN sort_order INTEGER"]
  ];

  for (const [column, statement] of additions) {
    if (!existing.has(column)) {
      await db.execute(statement);
    }
  }
}

async function seedDefaultCategories(db: SqlDatabase): Promise<void> {
  const now = new Date().toISOString();
  for (const category of DEFAULT_CATEGORIES) {
    await db.execute(
      `INSERT OR IGNORE INTO categories (id, name, color, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [category.id, category.name, category.color, now, now]
    );
  }
}

async function seedDefaultSettings(db: SqlDatabase): Promise<void> {
  const settingsEntries: Array<[string, unknown]> = [
    ["defaultCategoryId", DEFAULT_SETTINGS.defaultCategoryId],
    ["dailyFocusTargetMinutes", DEFAULT_SETTINGS.dailyFocusTargetMinutes],
    ["startWeekOnMonday", DEFAULT_SETTINGS.startWeekOnMonday],
    ["theme", DEFAULT_SETTINGS.theme],
    ["enableTray", DEFAULT_SETTINGS.enableTray],
    ["enableNotifications", DEFAULT_SETTINGS.enableNotifications],
    ["globalShortcut", DEFAULT_SETTINGS.globalShortcut]
  ];

  for (const [key, value] of settingsEntries) {
    await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ($1, $2)", [key, JSON.stringify(value)]);
  }
}
