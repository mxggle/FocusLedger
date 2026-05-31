import type { Category, CategoryStats, DailyStats, Task, TimeEntry, TodayStats } from "../types";
import { endOfDateKey, getRecentDateKeys, isIsoOnDate, startOfDateKey, toDateKey } from "../utils/date";

type StatsInput = {
  date: string;
  tasks: Task[];
  timeEntries: TimeEntry[];
  categories: Category[];
  now?: Date;
};

const INBOX_CATEGORY: Category = {
  id: "inbox",
  name: "Inbox",
  color: "#71717a",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString()
};

export function splitEntrySecondsByDate(entry: TimeEntry, date: string, now = new Date()): number {
  const start = new Date(entry.start_at);
  const end = entry.end_at ? new Date(entry.end_at) : now;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return 0;
  }

  const dayStart = startOfDateKey(date);
  const dayEnd = endOfDateKey(date);
  const overlapStart = Math.max(start.getTime(), dayStart.getTime());
  const overlapEnd = Math.min(end.getTime(), dayEnd.getTime());

  if (overlapEnd <= overlapStart) {
    return 0;
  }

  return Math.floor((overlapEnd - overlapStart) / 1000);
}

export function calculateTodayStats({ date, tasks, timeEntries, categories, now = new Date() }: StatsInput): TodayStats {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const categoryTotals = new Map<string, CategoryStats>();

  let totalFocusSeconds = 0;

  for (const entry of timeEntries) {
    const seconds = splitEntrySecondsByDate(entry, date, now);
    if (seconds === 0) {
      continue;
    }

    totalFocusSeconds += seconds;
    const task = taskById.get(entry.task_id);
    const category = task?.category_id ? categoryById.get(task.category_id) ?? INBOX_CATEGORY : INBOX_CATEGORY;
    const current = categoryTotals.get(category.id) ?? {
      categoryId: category.id,
      categoryName: category.name,
      color: category.color,
      totalSeconds: 0
    };

    current.totalSeconds += seconds;
    categoryTotals.set(category.id, current);
  }

  const tasksForDate = tasks.filter((task) => task.due_date === date);
  const estimatedSeconds = tasksForDate.reduce((sum, task) => sum + (task.estimated_minutes ?? 0) * 60, 0);

  const categoryStats = [...categoryTotals.values()]
    .filter((stat) => stat.totalSeconds > 0)
    .sort((left, right) => right.totalSeconds - left.totalSeconds || left.categoryName.localeCompare(right.categoryName));

  return {
    date,
    totalFocusSeconds,
    completedTaskCount: tasks.filter((task) => isIsoOnDate(task.completed_at, date)).length,
    droppedTaskCount: tasks.filter((task) => isIsoOnDate(task.dropped_at, date)).length,
    estimatedSeconds,
    actualSeconds: totalFocusSeconds,
    driftSeconds: totalFocusSeconds - estimatedSeconds,
    categoryStats
  };
}

export function calculateDateRangeStats(input: Omit<StatsInput, "date"> & { dates?: string[] }): DailyStats[] {
  const dates = input.dates ?? getRecentDateKeys(7);
  return dates.map((date) => {
    const todayStats = calculateTodayStats({ ...input, date });
    const entriesCount = input.timeEntries.filter((entry) => splitEntrySecondsByDate(entry, date, input.now) > 0).length;
    return { ...todayStats, entriesCount };
  });
}

export function getStatsRangeForLastSevenDays(endDate = new Date()): { startDate: string; endDate: string } {
  const dates = getRecentDateKeys(7, endDate);
  return {
    startDate: dates[0] ?? toDateKey(endDate),
    endDate: dates[dates.length - 1] ?? toDateKey(endDate)
  };
}
