import type { RecurrenceType, Task, TaskStatus, TaskTemplate } from "../types";

type ValidationResult = { ok: true } | { ok: false; message: string };

type PlannedBlock = {
  id?: string;
  title: string;
  planned_start_time: string | null;
  planned_end_time?: string | null;
  estimated_minutes?: number | null;
};

type TemplateBlock = PlannedBlock & {
  recurrence_type: RecurrenceType;
  recurrence_days: number[];
  enabled?: boolean;
};

type TaskBlock = PlannedBlock & {
  due_date: string | null;
  status: TaskStatus;
};

type TimeInterval = {
  start: number;
  end: number;
};

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAYS = [1, 2, 3, 4, 5];
const DAY_LABELS: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun"
};

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatMinutes(value: number): string {
  if (value === 1440) {
    return "24:00";
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function positiveEstimateMinutes(value: number | null | undefined): number | null {
  return Number.isFinite(value) && value && value > 0 ? value : null;
}

function getInterval(block: PlannedBlock, options: { requireDuration: boolean }): ValidationResult & { interval?: TimeInterval } {
  const start = parseTimeToMinutes(block.planned_start_time);
  if (start === null) {
    return { ok: false, message: "Start time is required." };
  }

  const explicitEnd = block.planned_end_time ? parseTimeToMinutes(block.planned_end_time) : null;
  if (block.planned_end_time && explicitEnd === null) {
    return { ok: false, message: "Use a valid end time." };
  }

  if (explicitEnd !== null) {
    if (explicitEnd <= start) {
      return { ok: false, message: "End time must be after start time." };
    }
    return { ok: true, interval: { start, end: explicitEnd } };
  }

  const estimateMinutes = positiveEstimateMinutes(block.estimated_minutes);
  if (estimateMinutes !== null) {
    const end = start + estimateMinutes;
    if (end > 1440) {
      return { ok: false, message: "Planned time must end before midnight." };
    }
    return { ok: true, interval: { start, end } };
  }

  if (options.requireDuration) {
    return { ok: false, message: "Add an end time or estimate to reserve a time block." };
  }

  return { ok: true, interval: { start, end: Math.min(start + 1, 1440) } };
}

function getTemplateDays(block: Pick<TemplateBlock, "recurrence_type" | "recurrence_days">): number[] {
  if (block.recurrence_type === "daily") {
    return ALL_DAYS;
  }

  if (block.recurrence_type === "weekdays") {
    return WEEKDAYS;
  }

  return [...new Set(block.recurrence_days.filter((day) => day >= 1 && day <= 7))].sort((a, b) => a - b);
}

function getSharedDays(a: number[], b: number[]): number[] {
  const bSet = new Set(b);
  return a.filter((day) => bSet.has(day));
}

function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

function formatDayList(days: number[]): string {
  if (days.length === 7) {
    return "Every day";
  }

  if (days.length === 5 && days.every((day) => WEEKDAYS.includes(day))) {
    return "Weekdays";
  }

  return days.map((day) => DAY_LABELS[day]).join(", ");
}

function formatInterval(interval: TimeInterval): string {
  return `${formatMinutes(interval.start)}-${formatMinutes(interval.end)}`;
}

export function validateTemplateSchedule(
  candidate: TemplateBlock,
  existingTemplates: TaskTemplate[],
  excludeId?: string
): ValidationResult {
  if (candidate.enabled === false) {
    return { ok: true };
  }

  const candidateDays = getTemplateDays(candidate);
  if (candidate.recurrence_type === "weekly" && candidateDays.length === 0) {
    return { ok: false, message: "Choose at least one repeat day." };
  }

  if (!candidate.planned_start_time) {
    return { ok: true };
  }

  const candidateInterval = getInterval(candidate, { requireDuration: true });
  if (!candidateInterval.ok || !candidateInterval.interval) {
    return candidateInterval;
  }

  for (const existing of existingTemplates) {
    if (existing.id === excludeId || !existing.enabled) {
      continue;
    }

    const sharedDays = getSharedDays(candidateDays, getTemplateDays(existing));
    if (sharedDays.length === 0) {
      continue;
    }

    const existingInterval = getInterval(existing, { requireDuration: false });
    if (!existingInterval.ok || !existingInterval.interval) {
      continue;
    }

    if (intervalsOverlap(candidateInterval.interval, existingInterval.interval)) {
      return {
        ok: false,
        message: `Time overlaps with "${existing.title}" (${formatDayList(sharedDays)}, ${formatInterval(existingInterval.interval)}).`
      };
    }
  }

  return { ok: true };
}

export function validateTaskSchedule(candidate: TaskBlock, existingTasks: Task[], excludeId?: string): ValidationResult {
  if (!candidate.planned_start_time || !candidate.due_date || candidate.status === "done" || candidate.status === "dropped") {
    return { ok: true };
  }

  const candidateInterval = getInterval(candidate, { requireDuration: true });
  if (!candidateInterval.ok || !candidateInterval.interval) {
    return candidateInterval;
  }

  for (const existing of existingTasks) {
    if (
      existing.id === excludeId ||
      existing.due_date !== candidate.due_date ||
      existing.status === "done" ||
      existing.status === "dropped" ||
      !existing.planned_start_time
    ) {
      continue;
    }

    const existingInterval = getInterval(existing, { requireDuration: false });
    if (!existingInterval.ok || !existingInterval.interval) {
      continue;
    }

    if (intervalsOverlap(candidateInterval.interval, existingInterval.interval)) {
      return {
        ok: false,
        message: `Time overlaps with "${existing.title}" (${formatInterval(existingInterval.interval)}).`
      };
    }
  }

  return { ok: true };
}
