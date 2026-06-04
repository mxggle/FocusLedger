import type { TaskRepository } from "../repositories/taskRepository.js";
import type { TimeEntryRepository } from "../repositories/timeEntryRepository.js";
import type { CategoryRepository } from "../repositories/categoryRepository.js";
import type { TimeEntryWithTaskRow } from "../db/types.js";
import { endOfDateKey, formatDuration, secondsToMinutes, startOfDateKey, toDateKey } from "../util/date.js";

const INBOX = { id: "inbox", name: "Inbox", color: "#71717a" } as const;

export interface CategorySummary {
  categoryId: string;
  name: string;
  color: string | null;
  seconds: number;
  minutes: number;
  label: string;
}

export interface DailySummary {
  date: string;
  totalFocusSeconds: number;
  totalFocusMinutes: number;
  totalFocusLabel: string;
  estimatedMinutes: number;
  actualMinutes: number;
  driftMinutes: number;
  completedTaskCount: number;
  droppedTaskCount: number;
  entryCount: number;
  byCategory: CategorySummary[];
}

export interface SummaryService {
  forDate(dateKey: string, now?: Date): DailySummary;
}

export interface SummaryDeps {
  tasks: TaskRepository;
  timeEntries: TimeEntryRepository;
  categories: CategoryRepository;
}

export function createSummaryService(deps: SummaryDeps): SummaryService {
  return {
    forDate(dateKey, now = new Date()): DailySummary {
      const dayStart = startOfDateKey(dateKey);
      const dayEnd = endOfDateKey(dateKey);
      const entries = deps.timeEntries.listForRange(
        dayStart.toISOString(),
        dayEnd.toISOString(),
        now.toISOString()
      );

      const totals = new Map<string, CategorySummary>();
      let totalFocusSeconds = 0;
      let entryCount = 0;

      for (const entry of entries) {
        const seconds = splitEntrySecondsByDate(entry, dateKey, now);
        if (seconds === 0) {
          continue;
        }
        totalFocusSeconds += seconds;
        entryCount += 1;

        const categoryId = entry.category_id ?? INBOX.id;
        const current = totals.get(categoryId) ?? {
          categoryId,
          name: entry.category_name ?? INBOX.name,
          color: entry.category_color ?? INBOX.color,
          seconds: 0,
          minutes: 0,
          label: ""
        };
        current.seconds += seconds;
        totals.set(categoryId, current);
      }

      const byCategory = [...totals.values()]
        .map((stat) => ({ ...stat, minutes: secondsToMinutes(stat.seconds), label: formatDuration(stat.seconds) }))
        .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));

      const allTasks = deps.tasks.list({ scope: "all" });
      const estimatedMinutes = allTasks
        .filter((task) => task.due_date === dateKey)
        .reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0);
      const actualMinutes = secondsToMinutes(totalFocusSeconds);

      return {
        date: dateKey,
        totalFocusSeconds,
        totalFocusMinutes: actualMinutes,
        totalFocusLabel: formatDuration(totalFocusSeconds),
        estimatedMinutes,
        actualMinutes,
        driftMinutes: actualMinutes - estimatedMinutes,
        completedTaskCount: allTasks.filter((task) => isIsoOnDate(task.completed_at, dateKey)).length,
        droppedTaskCount: allTasks.filter((task) => isIsoOnDate(task.dropped_at, dateKey)).length,
        entryCount,
        byCategory
      };
    }
  };
}

/**
 * Seconds of `entry` that fall inside `dateKey` (local day). Open entries run
 * until `now`. Cross-midnight entries contribute only their in-day overlap.
 */
export function splitEntrySecondsByDate(
  entry: Pick<TimeEntryWithTaskRow, "start_at" | "end_at">,
  dateKey: string,
  now = new Date()
): number {
  const start = new Date(entry.start_at);
  const end = entry.end_at ? new Date(entry.end_at) : now;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return 0;
  }

  const dayStart = startOfDateKey(dateKey).getTime();
  const dayEnd = endOfDateKey(dateKey).getTime();
  const overlapStart = Math.max(start.getTime(), dayStart);
  const overlapEnd = Math.min(end.getTime(), dayEnd);
  if (overlapEnd <= overlapStart) {
    return 0;
  }
  return Math.floor((overlapEnd - overlapStart) / 1000);
}

function isIsoOnDate(iso: string | null, dateKey: string): boolean {
  if (!iso) {
    return false;
  }
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && toDateKey(date) === dateKey;
}
