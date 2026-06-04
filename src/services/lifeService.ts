import { timeEntryRepository } from "../db/timeEntryRepository";
import type { TimeEntryWithTask } from "../types";
import { toDateKey } from "../utils/date";
import { parseLocalDate, weekIndexForDate } from "../utils/lifeWeeks";

export type WeekCategory = {
  name: string;
  color: string | null;
  seconds: number;
};

export type WeekFocus = {
  seconds: number;
  sessions: number;
  /** Categories worked that week, richest first. */
  categories: WeekCategory[];
  /** Focus seconds per calendar day (date key → seconds) within the week. */
  days: Record<string, number>;
};

export type LifeWeekFocus = {
  /** life-week index → aggregated focus for that week. */
  byWeek: Map<number, WeekFocus>;
  /** Largest weekly total, for scaling the heat colour. */
  maxSeconds: number;
};

function entrySeconds(entry: TimeEntryWithTask, now: Date): number {
  if (entry.duration_seconds !== null) return Math.max(0, entry.duration_seconds);
  return Math.max(0, Math.floor((now.getTime() - new Date(entry.start_at).getTime()) / 1000));
}

/**
 * Fold real time entries onto the life grid. Each entry lands in the life-week
 * its start date belongs to, so every coloured square reflects time you
 * actually logged. Pure so it can be unit-tested without a database.
 */
export function aggregateLifeWeeks(
  entries: TimeEntryWithTask[],
  birthDate: string,
  now: Date = new Date()
): LifeWeekFocus {
  const byWeek = new Map<number, WeekFocus>();
  let maxSeconds = 0;

  for (const entry of entries) {
    const start = new Date(entry.start_at);
    const index = weekIndexForDate(birthDate, start);
    if (index === null) continue;

    const seconds = entrySeconds(entry, now);
    if (seconds <= 0) continue;

    const week = byWeek.get(index) ?? {
      seconds: 0,
      sessions: 0,
      categories: [],
      days: {}
    };

    week.seconds += seconds;
    week.sessions += 1;

    const dayKey = toDateKey(start);
    week.days[dayKey] = (week.days[dayKey] ?? 0) + seconds;

    const categoryName = entry.category_name ?? "Inbox";
    const existing = week.categories.find((c) => c.name === categoryName);
    if (existing) {
      existing.seconds += seconds;
    } else {
      week.categories.push({
        name: categoryName,
        color: entry.category_color,
        seconds
      });
    }

    byWeek.set(index, week);
    if (week.seconds > maxSeconds) maxSeconds = week.seconds;
  }

  for (const week of byWeek.values()) {
    week.categories.sort((a, b) => b.seconds - a.seconds);
  }

  return { byWeek, maxSeconds };
}

/** The day within a week that holds the most focus — best target for History. */
export function peakDay(week: WeekFocus | undefined): string | null {
  if (!week) return null;
  let best: string | null = null;
  let bestSeconds = -1;
  for (const [day, seconds] of Object.entries(week.days)) {
    if (seconds > bestSeconds) {
      bestSeconds = seconds;
      best = day;
    }
  }
  return best;
}

/** Load and aggregate every tracked entry since birth onto the life grid. */
export async function loadLifeWeekFocus(birthDate: string): Promise<LifeWeekFocus> {
  const birth = parseLocalDate(birthDate);
  if (!birth) return { byWeek: new Map(), maxSeconds: 0 };

  const now = new Date();
  const entries = await timeEntryRepository.getEntriesForRange(
    birth.toISOString(),
    now.toISOString(),
    now.toISOString()
  );
  return aggregateLifeWeeks(entries, birthDate, now);
}
