import type { Task, TimeEntryWithTask } from "../../types";
import type { CategoryDelta, WeeklyReview } from "./types";

const WEEK_MS = 7 * 86_400_000;
const TOP_MOVERS = 3;
const UNCATEGORIZED = "Uncategorized";

function totalMinutes(entries: TimeEntryWithTask[]): number {
  return Math.round(entries.reduce((sum, e) => sum + (e.duration_seconds ?? 0), 0) / 60);
}

function minutesByCategory(entries: TimeEntryWithTask[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.category_name ?? UNCATEGORIZED;
    map.set(key, (map.get(key) ?? 0) + (entry.duration_seconds ?? 0));
  }
  return new Map([...map.entries()].map(([k, seconds]) => [k, Math.round(seconds / 60)]));
}

function withinLastWeek(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && now.getTime() - t <= WEEK_MS && t <= now.getTime();
}

export function computeWeeklyReview(
  thisWeek: TimeEntryWithTask[],
  lastWeek: TimeEntryWithTask[],
  tasks: Task[],
  now: Date
): WeeklyReview {
  const thisByCat = minutesByCategory(thisWeek);
  const lastByCat = minutesByCategory(lastWeek);
  const categories = new Set([...thisByCat.keys(), ...lastByCat.keys()]);

  const categoryDeltas: CategoryDelta[] = [...categories]
    .map((category) => {
      const thisWeekMinutes = thisByCat.get(category) ?? 0;
      const lastWeekMinutes = lastByCat.get(category) ?? 0;
      return { category, thisWeekMinutes, lastWeekMinutes, deltaMinutes: thisWeekMinutes - lastWeekMinutes };
    })
    .sort((a, b) => Math.abs(b.deltaMinutes) - Math.abs(a.deltaMinutes))
    .slice(0, TOP_MOVERS);

  const thisWeekMinutes = totalMinutes(thisWeek);
  const lastWeekMinutes = totalMinutes(lastWeek);

  return {
    thisWeekMinutes,
    lastWeekMinutes,
    deltaMinutes: thisWeekMinutes - lastWeekMinutes,
    categoryDeltas,
    completedCount: tasks.filter((t) => withinLastWeek(t.completed_at, now)).length,
    droppedCount: tasks.filter((t) => withinLastWeek(t.dropped_at, now)).length
  };
}
