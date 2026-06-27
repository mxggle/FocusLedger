import type { TimeEntryWithTask } from "../../types";
import type { CalibrationStat, EstimationCalibration } from "./types";

const MIN_TASKS_FOR_CONFIDENCE = 5;
const MIN_MEANINGFUL_SECONDS = 60;
const UNCATEGORIZED = "Uncategorized";

type TaskAccumulator = {
  estimatedMinutes: number;
  actualSeconds: number;
  category: string;
};

function buildStat(scope: string, tasks: TaskAccumulator[]): CalibrationStat | null {
  if (tasks.length === 0) return null;
  const estimatedMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const actualMinutes = Math.round(tasks.reduce((sum, t) => sum + t.actualSeconds, 0) / 60);
  if (estimatedMinutes === 0) return null;
  return {
    scope,
    estimatedMinutes,
    actualMinutes,
    ratio: actualMinutes / estimatedMinutes,
    sampleSize: tasks.length,
    confidence: tasks.length >= MIN_TASKS_FOR_CONFIDENCE ? "ok" : "low"
  };
}

export function computeEstimationCalibration(entries: TimeEntryWithTask[]): EstimationCalibration {
  const byTask = new Map<string, TaskAccumulator>();

  for (const entry of entries) {
    if (entry.task_estimated_minutes == null || entry.task_estimated_minutes <= 0) continue;
    const existing = byTask.get(entry.task_id);
    const seconds = entry.duration_seconds ?? 0;
    if (existing) {
      byTask.set(entry.task_id, { ...existing, actualSeconds: existing.actualSeconds + seconds });
    } else {
      byTask.set(entry.task_id, {
        estimatedMinutes: entry.task_estimated_minutes,
        actualSeconds: seconds,
        category: entry.category_name ?? UNCATEGORIZED
      });
    }
  }

  const qualifying = [...byTask.values()].filter((t) => t.actualSeconds >= MIN_MEANINGFUL_SECONDS);

  const byCategoryMap = new Map<string, TaskAccumulator[]>();
  for (const task of qualifying) {
    const list = byCategoryMap.get(task.category) ?? [];
    list.push(task);
    byCategoryMap.set(task.category, list);
  }

  const byCategory = [...byCategoryMap.entries()]
    .map(([category, tasks]) => buildStat(category, tasks))
    .filter((stat): stat is CalibrationStat => stat !== null);

  return { overall: buildStat("overall", qualifying), byCategory };
}
