import type { TimeEntryWithTask } from "../../types";
import { endOfDateKey, startOfDateKey } from "../../utils/date";

const HOUR_MS = 3_600_000;
const FALLBACK_COLOR = "#71717a";

export type TimelineBlock = {
  id: string;
  /** Position of the block's start within the window, 0–100. */
  leftPct: number;
  /** Block width as a share of the window, > 0. */
  widthPct: number;
  color: string;
  taskTitle: string;
  categoryName: string;
  startLabel: string;
  endLabel: string;
  durationSeconds: number;
  running: boolean;
};

export type TimelineModel = {
  /** Whole-hour window the track spans, e.g. 8 → 19. */
  startHour: number;
  endHour: number;
  /** Hours to draw axis labels at (kept to a readable count). */
  hourMarks: number[];
  blocks: TimelineBlock[];
  empty: boolean;
};

/** Default window when there is nothing to show (a normal working day). */
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 18;

function formatClock(ms: number): string {
  const date = new Date(ms);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** At most ~9 axis labels — thin the marks for wide windows. */
function buildHourMarks(startHour: number, endHour: number): number[] {
  const span = endHour - startHour;
  const step = span <= 9 ? 1 : Math.ceil(span / 9);
  const marks: number[] = [];
  for (let hour = startHour; hour <= endHour; hour += step) {
    marks.push(hour);
  }
  if (marks[marks.length - 1] !== endHour) {
    marks.push(endHour);
  }
  return marks;
}

/**
 * Lays out a day's focus sessions as positioned blocks on an hour axis.
 * Sessions are clamped to the day; a running session ends at `now`. The window
 * snaps to the whole hours that contain all activity, so the track is dense
 * rather than mostly-empty midnight-to-midnight.
 */
export function buildTimelineModel(
  entries: TimeEntryWithTask[],
  date: string,
  now = new Date()
): TimelineModel {
  const dayStart = startOfDateKey(date).getTime();
  const dayEnd = endOfDateKey(date).getTime();
  const nowMs = now.getTime();

  type Clamped = {
    entry: TimeEntryWithTask;
    start: number;
    end: number;
    running: boolean;
  };

  const clamped: Clamped[] = [];
  for (const entry of entries) {
    const rawStart = new Date(entry.start_at).getTime();
    const running = entry.end_at === null;
    const rawEnd = running ? nowMs : new Date(entry.end_at as string).getTime();
    if (Number.isNaN(rawStart) || Number.isNaN(rawEnd)) continue;

    const start = Math.max(rawStart, dayStart);
    const end = Math.min(rawEnd, dayEnd);
    if (end <= start) continue;

    clamped.push({ entry, start, end, running });
  }

  if (clamped.length === 0) {
    return {
      startHour: DEFAULT_START_HOUR,
      endHour: DEFAULT_END_HOUR,
      hourMarks: buildHourMarks(DEFAULT_START_HOUR, DEFAULT_END_HOUR),
      blocks: [],
      empty: true
    };
  }

  const minStart = Math.min(...clamped.map((item) => item.start));
  const maxEnd = Math.max(...clamped.map((item) => item.end));

  const startHour = Math.max(0, Math.floor((minStart - dayStart) / HOUR_MS));
  let endHour = Math.min(24, Math.ceil((maxEnd - dayStart) / HOUR_MS));
  if (endHour <= startHour) endHour = Math.min(24, startHour + 1);

  const windowStartMs = dayStart + startHour * HOUR_MS;
  const windowMs = (endHour - startHour) * HOUR_MS;

  const blocks: TimelineBlock[] = clamped.map((item) => ({
    id: item.entry.id,
    leftPct: ((item.start - windowStartMs) / windowMs) * 100,
    widthPct: ((item.end - item.start) / windowMs) * 100,
    color: item.entry.category_color ?? FALLBACK_COLOR,
    taskTitle: item.entry.task_title,
    categoryName: item.entry.category_name ?? "Inbox",
    startLabel: formatClock(item.start),
    endLabel: item.running ? "now" : formatClock(item.end),
    durationSeconds: Math.round((item.end - item.start) / 1000),
    running: item.running
  }));

  return {
    startHour,
    endHour,
    hourMarks: buildHourMarks(startHour, endHour),
    blocks,
    empty: false
  };
}

/** Formats an axis hour (0–24) as a compact 12-hour label, e.g. 9a, 12p, 6p. */
export function formatHourMark(hour: number): string {
  const normalized = hour % 24;
  const suffix = normalized < 12 ? "a" : "p";
  const twelve = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelve}${suffix}`;
}
