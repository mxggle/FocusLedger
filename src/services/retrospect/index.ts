import type { TimeEntryWithTask } from "../../types";
import { computeEstimationCalibration } from "./calibration";
import { loadRetrospectiveData } from "./loadHistory";
import { computeSlipAnalysis } from "./slips";
import type { RetrospectiveInsights } from "./types";
import { computeWeeklyReview } from "./weeklyReview";

export type { RetrospectiveInsights } from "./types";

const WINDOW_DAYS = 30;
const WEEK_MS = 7 * 86_400_000;

function partitionWeeks(entries: TimeEntryWithTask[], now: Date) {
  const thisWeek: TimeEntryWithTask[] = [];
  const lastWeek: TimeEntryWithTask[] = [];
  for (const entry of entries) {
    const age = now.getTime() - new Date(entry.start_at).getTime();
    if (age < 0) continue;
    if (age <= WEEK_MS) thisWeek.push(entry);
    else if (age <= 2 * WEEK_MS) lastWeek.push(entry);
  }
  return { thisWeek, lastWeek };
}

export async function buildRetrospectiveInsights(now = new Date()): Promise<RetrospectiveInsights> {
  const { entries, tasks } = await loadRetrospectiveData(now, WINDOW_DAYS);
  const calibration = computeEstimationCalibration(entries);
  const slips = computeSlipAnalysis(tasks, entries, now);
  const { thisWeek, lastWeek } = partitionWeeks(entries, now);
  const weekly = computeWeeklyReview(thisWeek, lastWeek, tasks, now);

  const hasData = entries.length > 0 || slips.items.length > 0;

  return { windowDays: WINDOW_DAYS, hasData, calibration, slips, weekly };
}
