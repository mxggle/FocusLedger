import type { TodayStats } from "../../types";
import { formatDurationCompact } from "../../utils/duration";

/** Default download name for a day's exported report, e.g. yolo-my-day-2026-05-29.png. */
export function buildShareFilename(date: string): string {
  return `yolo-my-day-${date}.png`;
}

/**
 * One-line "most time on X" highlight for the share card footer, or null when
 * there was no tracked category time.
 */
export function topFocusLine(stats: TodayStats): string | null {
  const top = stats.categoryStats[0];
  if (!top || top.totalSeconds <= 0) {
    return null;
  }
  return `${top.categoryName} · ${formatDurationCompact(top.totalSeconds)}`;
}
