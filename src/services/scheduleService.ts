import { taskRepository } from "../db/taskRepository";
import { taskTemplateRepository } from "../db/taskTemplateRepository";
import type { TaskTemplate } from "../types";
import { parseDateKey } from "../utils/date";

export function getPlanWeekday(dateKey: string): number {
  const day = parseDateKey(dateKey).getDay();
  return day === 0 ? 7 : day;
}

export function templateAppliesToDate(template: Pick<TaskTemplate, "recurrence_type" | "recurrence_days">, dateKey: string): boolean {
  const weekday = getPlanWeekday(dateKey);

  if (template.recurrence_type === "daily") {
    return true;
  }

  if (template.recurrence_type === "weekdays") {
    return weekday >= 1 && weekday <= 5;
  }

  return template.recurrence_days.includes(weekday);
}

function timeToSortOrder(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export const scheduleService = {
  async generateTasksForDate(date: string): Promise<void> {
    const templates = await taskTemplateRepository.getEnabled();

    for (const template of templates) {
      if (!templateAppliesToDate(template, date)) {
        continue;
      }

      let occurrence = await taskTemplateRepository.getOccurrence(template.id, date);
      if (occurrence?.task_id || occurrence?.skipped_at) {
        continue;
      }

      if (!occurrence) {
        await taskTemplateRepository.createOccurrence(template.id, date, null);
        occurrence = await taskTemplateRepository.getOccurrence(template.id, date);
      }

      if (!occurrence) {
        continue;
      }

      const task = await taskRepository.createTask({
        title: template.title,
        description: template.description,
        category_id: template.category_id,
        priority: template.priority,
        estimated_minutes: template.estimated_minutes,
        due_date: date,
        template_id: template.id,
        planned_start_time: template.planned_start_time,
        planned_end_time: template.planned_end_time,
        sort_order: timeToSortOrder(template.planned_start_time)
      });

      await taskTemplateRepository.setOccurrenceTask(occurrence.id, task.id);
    }
  }
};
