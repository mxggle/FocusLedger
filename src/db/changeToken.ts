import { getDatabase } from "./client";

type TaskDataChangeTokenRow = {
  tasks_count: number;
  tasks_updated_at: string | null;
  time_entries_count: number;
  time_entries_updated_at: string | null;
  categories_count: number;
  categories_updated_at: string | null;
  task_templates_count: number;
  task_templates_updated_at: string | null;
  template_occurrences_count: number;
  template_occurrences_updated_at: string | null;
};

function tableToken(count: number, updatedAt: string | null): string {
  return `${count}:${updatedAt ?? ""}`;
}

/**
 * Compact fingerprint for all tables that feed the task store views.
 *
 * MCP writes happen in a separate process, so React will not know about them
 * until it asks SQLite again. Counts catch deletes; max updated_at catches
 * inserts and edits from both the desktop app and MCP.
 */
export async function readTaskDataChangeToken(): Promise<string> {
  const db = await getDatabase();
  const rows = await db.select<TaskDataChangeTokenRow[]>(`
    SELECT
      (SELECT COUNT(*) FROM tasks) AS tasks_count,
      (SELECT MAX(updated_at) FROM tasks) AS tasks_updated_at,
      (SELECT COUNT(*) FROM time_entries) AS time_entries_count,
      (SELECT MAX(updated_at) FROM time_entries) AS time_entries_updated_at,
      (SELECT COUNT(*) FROM categories) AS categories_count,
      (SELECT MAX(updated_at) FROM categories) AS categories_updated_at,
      (SELECT COUNT(*) FROM task_templates) AS task_templates_count,
      (SELECT MAX(updated_at) FROM task_templates) AS task_templates_updated_at,
      (SELECT COUNT(*) FROM template_occurrences) AS template_occurrences_count,
      (SELECT MAX(updated_at) FROM template_occurrences) AS template_occurrences_updated_at
  `);
  const row = rows[0];
  if (!row) {
    return "";
  }

  return [
    tableToken(row.tasks_count, row.tasks_updated_at),
    tableToken(row.time_entries_count, row.time_entries_updated_at),
    tableToken(row.categories_count, row.categories_updated_at),
    tableToken(row.task_templates_count, row.task_templates_updated_at),
    tableToken(row.template_occurrences_count, row.template_occurrences_updated_at)
  ].join("|");
}
