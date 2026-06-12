import type { SqliteDatabase } from "../db/database.js";
import type { TaskRow, TaskStatus } from "../db/types.js";
import { toDateKey } from "../util/date.js";

export interface TaskFilter {
  scope?: "today" | "backlog" | "all";
  status?: TaskStatus[];
  categoryId?: string;
  dueOn?: string;
  limit?: number;
}

const SELECT = "SELECT * FROM tasks";
const PRIORITY_ORDER = "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END";

/** Columns a caller may change on an existing task. */
export type TaskPatch = Partial<
  Pick<
    TaskRow,
    | "title"
    | "description"
    | "category_id"
    | "status"
    | "priority"
    | "estimated_minutes"
    | "due_date"
    | "planned_start_time"
    | "planned_end_time"
    | "sort_order"
    | "completed_at"
    | "dropped_at"
  >
>;

export interface TaskRepository {
  list(filter: TaskFilter): TaskRow[];
  getById(id: string): TaskRow | null;
  insert(row: TaskRow): void;
  /** Merge `patch` into the stored row (app semantics: stamps `updated_at`). */
  update(id: string, patch: TaskPatch): TaskRow;
}

export function createTaskRepository(db: SqliteDatabase): TaskRepository {
  return {
    list(filter: TaskFilter): TaskRow[] {
      if (filter.scope === "today") {
        return listToday(db, filter);
      }

      const clauses: string[] = [];
      const params: unknown[] = [];

      if (filter.scope === "backlog") {
        clauses.push("due_date IS NULL", "status NOT IN ('done', 'dropped')");
      }
      if (filter.status?.length) {
        clauses.push(`status IN (${filter.status.map(() => "?").join(", ")})`);
        params.push(...filter.status);
      }
      if (filter.categoryId) {
        clauses.push("category_id = ?");
        params.push(filter.categoryId);
      }
      if (filter.dueOn) {
        clauses.push("due_date = ?");
        params.push(filter.dueOn);
      }

      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const limit = limitClause(filter.limit);
      const sql = `${SELECT}${where} ORDER BY ${PRIORITY_ORDER}, created_at DESC${limit}`;
      return db.prepare(sql).all(...params) as TaskRow[];
    },

    getById(id: string): TaskRow | null {
      const row = db.prepare(`${SELECT} WHERE id = ? LIMIT 1`).get(id) as TaskRow | undefined;
      return row ?? null;
    },

    insert(row: TaskRow): void {
      db.prepare(
        `INSERT INTO tasks (
          id, title, description, category_id, status, priority, estimated_minutes,
          due_date, template_id, planned_start_time, planned_end_time, sort_order,
          created_at, updated_at, completed_at, dropped_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        row.id,
        row.title,
        row.description,
        row.category_id,
        row.status,
        row.priority,
        row.estimated_minutes,
        row.due_date,
        row.template_id,
        row.planned_start_time,
        row.planned_end_time,
        row.sort_order,
        row.created_at,
        row.updated_at,
        row.completed_at,
        row.dropped_at
      );
    },

    update(id: string, patch: TaskPatch): TaskRow {
      const existing = this.getById(id);
      if (!existing) {
        throw new Error(`Task not found: ${id}`);
      }

      const next: TaskRow = { ...existing, ...patch, updated_at: new Date().toISOString() };
      db.prepare(
        `UPDATE tasks SET
          title = ?, description = ?, category_id = ?, status = ?, priority = ?,
          estimated_minutes = ?, due_date = ?, planned_start_time = ?,
          planned_end_time = ?, sort_order = ?, updated_at = ?, completed_at = ?,
          dropped_at = ?
         WHERE id = ?`
      ).run(
        next.title,
        next.description,
        next.category_id,
        next.status,
        next.priority,
        next.estimated_minutes,
        next.due_date,
        next.planned_start_time,
        next.planned_end_time,
        next.sort_order,
        next.updated_at,
        next.completed_at,
        next.dropped_at,
        id
      );
      return next;
    }
  };
}

/**
 * Mirror the app's "Today" query: carry unfinished past-due tasks forward and
 * always include whatever is in-progress, regardless of due date.
 */
function listToday(db: SqliteDatabase, filter: TaskFilter): TaskRow[] {
  const date = filter.dueOn ?? toDateKey();
  const sql = `${SELECT}
     WHERE (
       (due_date <= ? AND status NOT IN ('done', 'dropped'))
       OR status IN ('doing', 'paused')
     )
     ORDER BY
       CASE status WHEN 'doing' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
       CASE WHEN due_date < ? THEN 0 ELSE 1 END,
       due_date ASC,
       CASE WHEN planned_start_time IS NULL THEN 1 ELSE 0 END,
       planned_start_time ASC,
       COALESCE(sort_order, 9999) ASC,
       ${PRIORITY_ORDER},
       created_at DESC${limitClause(filter.limit)}`;
  return db.prepare(sql).all(date, date) as TaskRow[];
}

function limitClause(limit?: number): string {
  if (!limit || !Number.isInteger(limit) || limit <= 0) {
    return "";
  }
  // Inlined as a sanitized integer — SQLite does not accept a bound LIMIT in all builds.
  return ` LIMIT ${Math.floor(limit)}`;
}
