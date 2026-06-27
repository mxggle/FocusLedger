import type { ContextTask } from "./types";

/** Derived "where are we in the day right now" signals. All computed in TS so the
 *  model only narrates them — never asked to do clock math on raw fields. */
export type TimePulse = {
  nowMinutes: number;
  current?: { title: string; endsInMin: number }; // now falls inside this planned window
  next?: { title: string; startsInMin: number }; // earliest open task starting later today
  overdue: { title: string; endedMinAgo: number }[]; // open tasks whose planned window already passed
};

const OPEN_STATUSES = new Set(["todo", "doing", "paused"]);

/** Minutes since midnight for an "HH:mm" string, or null if unparseable. */
export function hhmmToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Reduce today's open, scheduled tasks into a few time-relative facts given the
 * current minute-of-day. Returns null when there is nothing time-relevant to say.
 */
export function computeTimePulse(nowMinutes: number, tasks: ContextTask[]): TimePulse | null {
  const open = tasks.filter((task) => OPEN_STATUSES.has(task.status));

  let current: TimePulse["current"];
  let next: TimePulse["next"];
  let nextStart = Infinity;
  const overdue: TimePulse["overdue"] = [];

  for (const task of open) {
    const start = hhmmToMinutes(task.plannedStartTime);
    const end = hhmmToMinutes(task.plannedEndTime);

    if (start != null && end != null && start <= nowMinutes && nowMinutes < end) {
      current = { title: task.title, endsInMin: end - nowMinutes };
      continue;
    }
    if (start != null && start > nowMinutes && start < nextStart) {
      nextStart = start;
      next = { title: task.title, startsInMin: start - nowMinutes };
      continue;
    }
    // A planned window that has fully elapsed while the task is still open = running late.
    const windowEnd = end ?? start;
    if (windowEnd != null && windowEnd <= nowMinutes) {
      overdue.push({ title: task.title, endedMinAgo: nowMinutes - windowEnd });
    }
  }

  if (!current && !next && overdue.length === 0) return null;
  return { nowMinutes, current, next, overdue };
}

/** One-line narration of the pulse for the system prompt. */
export function renderTimePulse(pulse: TimePulse): string {
  const parts: string[] = [];
  if (pulse.current) parts.push(`in progress now: "${pulse.current.title}" (planned to end in ${pulse.current.endsInMin}m)`);
  if (pulse.next) parts.push(`next up: "${pulse.next.title}" starts in ${pulse.next.startsInMin}m`);
  if (pulse.overdue.length > 0) {
    const late = pulse.overdue
      .slice(0, 3)
      .map((item) => `"${item.title}" (slot ended ${item.endedMinAgo}m ago)`)
      .join(", ");
    const more = pulse.overdue.length > 3 ? ` +${pulse.overdue.length - 3} more` : "";
    parts.push(`past its planned slot but still open: ${late}${more}`);
  }
  return `Right now (pre-computed — do not recalculate): ${parts.join("; ")}.`;
}
