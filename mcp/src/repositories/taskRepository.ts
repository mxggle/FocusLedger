import type { SqliteDatabase } from "../db/database.js";
import type { TaskRow, TaskStatus } from "../db/types.js";

export interface TaskFilter {
  scope?: "today" | "backlog" | "all";
  status?: TaskStatus[];
  categoryId?: string;
  dueOn?: string;
  limit?: number;
}

const SELECT = "SELECT * FROM tasks";
const PRIORITY_ORDER = "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END";

export interface TaskRepository {
  list(filter: TaskFilter): TaskRow[];
  getById(id: string): TaskRow | null;
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
    }
  };
}

/**
 * Mirror the app's "Today" query: carry unfinished past-due tasks forward and
 * always include whatever is in-progress, regardless of due date.
 */
function listToday(db: SqliteDatabase, filter: TaskFilter): TaskRow[] {
  const date = filter.dueOn ?? new Date().toISOString().slice(0, 10);
  const sql = `${SELECT}
     WHERE (
       (due_date <= ? AND status NOT IN ('done', 'dropped'))
       OR status IN ('doing', 'paused')
     )
     ORDER BY
       CASE status WHEN 'doing' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
       CASE WHEN due_date < ? THEN 0 ELSE 1 END,
       due_date ASC,
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
