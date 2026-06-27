import type { SqlDatabase } from "./types";
import { DEFAULT_SETTINGS } from "../types";
import { deriveSessionTitle } from "../services/ai/assistant/sessionTitle";

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
  `CREATE TABLE IF NOT EXISTS daily_debriefs (
    date TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS assistant_messages (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    actions TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_messages_created ON assistant_messages(created_at)`,
  `CREATE TABLE IF NOT EXISTS assistant_sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_sessions_updated ON assistant_sessions(updated_at)`,
  `CREATE TABLE IF NOT EXISTS assistant_memory (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    source_message_id TEXT,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_memory_status ON assistant_memory(status)`,
  `CREATE TABLE IF NOT EXISTS assistant_skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    trigger TEXT NOT NULL,
    steps TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_skills_archived ON assistant_skills(archived)`,
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
  // WAL lets the desktop app and the external MCP reader access the database
  // concurrently without lock contention. Persisted in the file; idempotent.
  await db.execute("PRAGMA journal_mode=WAL");

  for (const statement of SCHEMA_STATEMENTS) {
    await db.execute(statement);
  }

  await ensureTaskScheduleColumns(db);
  await ensureDebriefInputHashColumn(db);
  await ensureAssistantSessionColumn(db);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_tasks_template_due ON tasks(template_id, due_date)");
  await ensureTemplateStartTimeNullable(db);
  await seedDefaultCategories(db);
  await seedDefaultSettings(db);
}

/**
 * Add the `session_id` column to assistant_messages and group any pre-existing
 * (un-grouped) messages into a single backfilled "Earlier conversation" session
 * so history-aware code can always assume every message belongs to a session.
 */
async function ensureAssistantSessionColumn(db: SqlDatabase): Promise<void> {
  const columns = await db.select<Array<{ name: string }>>("PRAGMA table_info(assistant_messages)");
  if (!columns.some((column) => column.name === "session_id")) {
    await db.execute("ALTER TABLE assistant_messages ADD COLUMN session_id TEXT");
  }
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_assistant_messages_session ON assistant_messages(session_id, created_at)"
  );

  const orphan = await db.select<Array<{ count: number }>>(
    "SELECT COUNT(*) AS count FROM assistant_messages WHERE session_id IS NULL"
  );
  if (!orphan[0] || orphan[0].count === 0) return;

  const bounds = await db.select<Array<{ min_at: string | null; max_at: string | null }>>(
    "SELECT MIN(created_at) AS min_at, MAX(created_at) AS max_at FROM assistant_messages WHERE session_id IS NULL"
  );
  const firstUser = await db.select<Array<{ content: string }>>(
    "SELECT content FROM assistant_messages WHERE session_id IS NULL AND role = 'user' ORDER BY created_at ASC LIMIT 1"
  );

  const now = new Date().toISOString();
  const createdAt = bounds[0]?.min_at ?? now;
  const updatedAt = bounds[0]?.max_at ?? now;
  const title = deriveSessionTitle(firstUser[0]?.content) || "Earlier conversation";
  const sessionId = `ses_legacy_${createdAt}`;

  await db.execute(
    `INSERT OR IGNORE INTO assistant_sessions (id, title, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    [sessionId, title, createdAt, updatedAt]
  );
  await db.execute("UPDATE assistant_messages SET session_id = $1 WHERE session_id IS NULL", [sessionId]);
}

async function ensureTemplateStartTimeNullable(db: SqlDatabase): Promise<void> {
  const columns = await db.select<Array<{ name: string; notnull: number }>>(
    "PRAGMA table_info(task_templates)"
  );
  const col = columns.find((c) => c.name === "planned_start_time");
  if (!col || col.notnull === 0) return;

  await db.execute(
    `CREATE TABLE task_templates_v2 (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category_id TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      estimated_minutes INTEGER,
      planned_start_time TEXT,
      planned_end_time TEXT,
      recurrence_type TEXT NOT NULL,
      recurrence_days TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`
  );
  await db.execute("INSERT INTO task_templates_v2 SELECT * FROM task_templates");
  await db.execute("DROP TABLE task_templates");
  await db.execute("ALTER TABLE task_templates_v2 RENAME TO task_templates");
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_task_templates_enabled ON task_templates(enabled)"
  );
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

async function ensureDebriefInputHashColumn(db: SqlDatabase): Promise<void> {
  const columns = await db.select<Array<{ name: string }>>("PRAGMA table_info(daily_debriefs)");
  if (!columns.some((column) => column.name === "input_hash")) {
    await db.execute("ALTER TABLE daily_debriefs ADD COLUMN input_hash TEXT");
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
    ["globalShortcut", DEFAULT_SETTINGS.globalShortcut],
    ["birthDate", DEFAULT_SETTINGS.birthDate],
    ["lifeExpectancyYears", DEFAULT_SETTINGS.lifeExpectancyYears]
  ];

  for (const [key, value] of settingsEntries) {
    await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ($1, $2)", [key, JSON.stringify(value)]);
  }
}
