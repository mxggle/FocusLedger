import { getDatabase } from "./client";
import type {
  CreateTaskTemplateInput,
  RecurrenceType,
  TaskTemplate,
  TemplateOccurrence,
  UpdateTaskTemplateInput
} from "../types";
import { createId } from "../utils/id";

type TaskTemplateRow = Omit<TaskTemplate, "recurrence_days" | "enabled"> & {
  recurrence_days: string;
  enabled: number;
};

const TEMPLATE_SELECT = `SELECT * FROM task_templates`;

function parseDays(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is number => Number.isInteger(item)) : [];
  } catch {
    return [];
  }
}

function fromRow(row: TaskTemplateRow): TaskTemplate {
  return {
    ...row,
    recurrence_type: row.recurrence_type as RecurrenceType,
    recurrence_days: parseDays(row.recurrence_days),
    enabled: Boolean(row.enabled)
  };
}

function normalizeDays(input: CreateTaskTemplateInput | UpdateTaskTemplateInput): number[] {
  const days = input.recurrence_days ?? [];
  return [...new Set(days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b);
}

export const taskTemplateRepository = {
  async createTemplate(input: CreateTaskTemplateInput): Promise<TaskTemplate> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const template: TaskTemplate = {
      id: createId("tpl"),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category_id: input.category_id || "inbox",
      priority: input.priority ?? "medium",
      estimated_minutes: input.estimated_minutes ?? null,
      planned_start_time: input.planned_start_time,
      planned_end_time: input.planned_end_time || null,
      recurrence_type: input.recurrence_type,
      recurrence_days: normalizeDays(input),
      enabled: input.enabled ?? true,
      created_at: now,
      updated_at: now
    };

    await db.execute(
      `INSERT INTO task_templates (
        id, title, description, category_id, priority, estimated_minutes,
        planned_start_time, planned_end_time, recurrence_type, recurrence_days,
        enabled, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        template.id,
        template.title,
        template.description,
        template.category_id,
        template.priority,
        template.estimated_minutes,
        template.planned_start_time,
        template.planned_end_time,
        template.recurrence_type,
        JSON.stringify(template.recurrence_days),
        template.enabled ? 1 : 0,
        template.created_at,
        template.updated_at
      ]
    );

    return template;
  },

  async getAll(): Promise<TaskTemplate[]> {
    const db = await getDatabase();
    const rows = await db.select<TaskTemplateRow[]>(
      `${TEMPLATE_SELECT}
       ORDER BY enabled DESC, planned_start_time ASC, created_at DESC`
    );
    return rows.map(fromRow);
  },

  async getEnabled(): Promise<TaskTemplate[]> {
    const db = await getDatabase();
    const rows = await db.select<TaskTemplateRow[]>(
      `${TEMPLATE_SELECT}
       WHERE enabled = 1
       ORDER BY planned_start_time ASC, created_at ASC`
    );
    return rows.map(fromRow);
  },

  async getById(id: string): Promise<TaskTemplate | null> {
    const db = await getDatabase();
    const rows = await db.select<TaskTemplateRow[]>(`${TEMPLATE_SELECT} WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? fromRow(rows[0]) : null;
  },

  async updateTemplate(id: string, input: UpdateTaskTemplateInput): Promise<TaskTemplate> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Plan item not found");
    }

    const db = await getDatabase();
    const next: TaskTemplate = {
      ...existing,
      ...input,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      description: input.description !== undefined ? input.description?.trim() || null : existing.description,
      category_id: input.category_id !== undefined ? input.category_id || "inbox" : existing.category_id,
      planned_end_time: input.planned_end_time !== undefined ? input.planned_end_time || null : existing.planned_end_time,
      recurrence_days: input.recurrence_days !== undefined ? normalizeDays(input) : existing.recurrence_days,
      updated_at: new Date().toISOString()
    };

    await db.execute(
      `UPDATE task_templates SET
        title = $1,
        description = $2,
        category_id = $3,
        priority = $4,
        estimated_minutes = $5,
        planned_start_time = $6,
        planned_end_time = $7,
        recurrence_type = $8,
        recurrence_days = $9,
        enabled = $10,
        updated_at = $11
       WHERE id = $12`,
      [
        next.title,
        next.description,
        next.category_id,
        next.priority,
        next.estimated_minutes,
        next.planned_start_time,
        next.planned_end_time,
        next.recurrence_type,
        JSON.stringify(next.recurrence_days),
        next.enabled ? 1 : 0,
        next.updated_at,
        id
      ]
    );

    return next;
  },

  async deleteTemplate(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM task_templates WHERE id = $1", [id]);
  },

  async getOccurrence(templateId: string, date: string): Promise<TemplateOccurrence | null> {
    const db = await getDatabase();
    const rows = await db.select<TemplateOccurrence[]>(
      "SELECT * FROM template_occurrences WHERE template_id = $1 AND date = $2 LIMIT 1",
      [templateId, date]
    );
    return rows[0] ?? null;
  },

  async createOccurrence(templateId: string, date: string, taskId: string | null): Promise<TemplateOccurrence> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const occurrence: TemplateOccurrence = {
      id: createId("occ"),
      template_id: templateId,
      date,
      task_id: taskId,
      skipped_at: null,
      created_at: now,
      updated_at: now
    };

    await db.execute(
      `INSERT OR IGNORE INTO template_occurrences (
        id, template_id, date, task_id, skipped_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        occurrence.id,
        occurrence.template_id,
        occurrence.date,
        occurrence.task_id,
        occurrence.skipped_at,
        occurrence.created_at,
        occurrence.updated_at
      ]
    );

    return occurrence;
  },

  async setOccurrenceTask(occurrenceId: string, taskId: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("UPDATE template_occurrences SET task_id = $1, updated_at = $2 WHERE id = $3", [
      taskId,
      new Date().toISOString(),
      occurrenceId
    ]);
  }
};
