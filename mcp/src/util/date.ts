/**
 * Date helpers mirroring the desktop app's local-time "date key" semantics
 * (`YYYY-MM-DD`). Timestamps in the DB are ISO/UTC; day boundaries are computed
 * in the machine's local timezone, matching how the app buckets a day.
 */

export function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(startOfDateKey(value).getTime());
}

export function startOfDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function endOfDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

/** Whole-minute rounding of a second count, for human-facing summaries. */
export function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/** Format a second count as `Hh Mm` (e.g. `1h 05m`, `0m`). */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
