import type { Task, TimeEntryWithTask } from "../../types";
import { toDateKey } from "../../utils/date";
import type { BlockerTheme, SlipAnalysis, SlipItem } from "./types";

const LINGER_DAYS = 14;
const DROPPED_MIN_LIFETIME_DAYS = 14;
const TOP_SLIPS = 3;
const TOP_THEMES = 3;
const MIN_THEME_COUNT = 2;
const MIN_KEYWORD_LENGTH = 4;
const MS_PER_DAY = 86_400_000;

const STOPWORDS = new Set([
  "waiting",
  "blocked",
  "still",
  "need",
  "needed",
  "with",
  "from",
  "that",
  "this",
  "have",
  "about",
  "could",
  "would",
  "their",
  "there"
]);

function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return 0;
  return Math.floor((to.getTime() - from) / MS_PER_DAY);
}

function classifyTask(task: Task, now: Date): SlipItem | null {
  const todayKey = toDateKey(now);

  if (task.status === "dropped") {
    if (!task.dropped_at) return null;
    const lifetime = daysBetween(task.created_at, new Date(task.dropped_at));
    if (lifetime < DROPPED_MIN_LIFETIME_DAYS) return null;
    return { taskId: task.id, title: task.title, kind: "dropped", ageDays: lifetime };
  }

  if (task.status === "done") return null;

  // Open task (todo / doing / paused): overdue takes priority over lingering.
  if (task.due_date && task.due_date < todayKey) {
    return { taskId: task.id, title: task.title, kind: "overdue", ageDays: daysBetween(task.created_at, now) };
  }

  const age = daysBetween(task.created_at, now);
  if (age >= LINGER_DAYS) {
    return { taskId: task.id, title: task.title, kind: "lingering", ageDays: age };
  }

  return null;
}

function themeBlockers(entries: TimeEntryWithTask[]): BlockerTheme[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.blocker) continue;
    const seen = new Set<string>();
    for (const word of entry.blocker.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length < MIN_KEYWORD_LENGTH || STOPWORDS.has(word) || seen.has(word)) continue;
      seen.add(word);
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_THEME_COUNT)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_THEMES)
    .map(([keyword, count]) => ({ keyword, count }));
}

export function computeSlipAnalysis(
  tasks: Task[],
  entries: TimeEntryWithTask[],
  now: Date
): SlipAnalysis {
  const slips = tasks
    .map((task) => classifyTask(task, now))
    .filter((item): item is SlipItem => item !== null)
    .sort((a, b) => b.ageDays - a.ageDays);

  return {
    items: slips.slice(0, TOP_SLIPS),
    moreCount: Math.max(0, slips.length - TOP_SLIPS),
    blockerThemes: themeBlockers(entries)
  };
}
