import { getDatabase } from "./client";
import type { CreateTaskInput, Task, TaskStatus, UpdateTaskInput } from "../types";
import { toDateKey } from "../utils/date";
import { createId } from "../utils/id";

const TASK_SELECT = `SELECT * FROM tasks`;

export const taskRepository = {
  async createTask(input: CreateTaskInput): Promise<Task> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const task: Task = {
      id: createId("task"),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category_id: input.category_id || "inbox",
      status: "todo",
      priority: input.priority ?? "medium",
      estimated_minutes: input.estimated_minutes ?? null,
      due_date: input.due_date ?? toDateKey(),
      created_at: now,
      updated_at: now,
      completed_at: null,
      dropped_at: null
    };

    await db.execute(
      `INSERT INTO tasks (
        id, title, description, category_id, status, priority, estimated_minutes,
        due_date, created_at, updated_at, completed_at, dropped_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        task.id,
        task.title,
        task.description,
        task.category_id,
        task.status,
        task.priority,
        task.estimated_minutes,
        task.due_date,
        task.created_at,
        task.updated_at,
        task.completed_at,
        task.dropped_at
      ]
    );

    return task;
  },

  async getById(id: string): Promise<Task | null> {
    const db = await getDatabase();
    const rows = await db.select<Task[]>(`${TASK_SELECT} WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ?? null;
  },

  async getAll(): Promise<Task[]> {
    const db = await getDatabase();
    return db.select<Task[]>(
      `${TASK_SELECT}
       ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        created_at DESC`
    );
  },

  async getTodayTasks(date = toDateKey()): Promise<Task[]> {
    const db = await getDatabase();
    return db.select<Task[]>(
      `${TASK_SELECT}
       WHERE (
        due_date = $1 AND status NOT IN ('done', 'dropped')
       ) OR status IN ('doing', 'paused')
       ORDER BY
        CASE status WHEN 'doing' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        created_at DESC`,
      [date]
    );
  },

  async updateTask(id: string, input: UpdateTaskInput & { completed_at?: string | null; dropped_at?: string | null }): Promise<Task> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Task not found");
    }

    const db = await getDatabase();
    const next: Task = {
      ...existing,
      ...input,
      updated_at: new Date().toISOString()
    };

    await db.execute(
      `UPDATE tasks SET
        title = $1,
        description = $2,
        category_id = $3,
        status = $4,
        priority = $5,
        estimated_minutes = $6,
        due_date = $7,
        updated_at = $8,
        completed_at = $9,
        dropped_at = $10
       WHERE id = $11`,
      [
        next.title,
        next.description,
        next.category_id,
        next.status,
        next.priority,
        next.estimated_minutes,
        next.due_date,
        next.updated_at,
        next.completed_at,
        next.dropped_at,
        id
      ]
    );

    return next;
  },

  async setStatus(id: string, status: TaskStatus): Promise<Task> {
    const timestamp = new Date().toISOString();
    return this.updateTask(id, {
      status,
      completed_at: status === "done" ? timestamp : null,
      dropped_at: status === "dropped" ? timestamp : null
    });
  },

  async deleteTask(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM time_entries WHERE task_id = $1", [id]);
    await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
  }
};
