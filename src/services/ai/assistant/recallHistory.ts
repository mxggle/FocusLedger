import { timeEntryRepository } from "../../../db/timeEntryRepository";
import type { TimeEntryWithTask } from "../../../types";

/** A compact, prompt-friendly slice of a logged reflection, for the recall tool. */
export type RecallEntry = {
  date: string; // YYYY-MM-DD
  taskTitle: string;
  category: string | null;
  note: string | null;
  blocker: string | null;
  nextAction: string | null;
};

function clean(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Keep only entries that carry a reflection, mapped to the compact shape. Pure. */
export function toRecallEntries(entries: TimeEntryWithTask[]): RecallEntry[] {
  const result: RecallEntry[] = [];
  for (const entry of entries) {
    const note = clean(entry.note);
    const blocker = clean(entry.blocker);
    const nextAction = clean(entry.next_action);
    if (!note && !blocker && !nextAction) continue;
    result.push({
      date: entry.start_at.slice(0, 10),
      taskTitle: entry.task_title,
      category: entry.category_name,
      note,
      blocker,
      nextAction
    });
  }
  return result;
}

/**
 * Load the trailing window of reflections for recall. Impure boundary — the only
 * DB-touching part. Best-effort callers should catch and fall back to [].
 */
export async function loadRecallEntries(
  now: Date = new Date(),
  windowDays = 60,
  cap = 80
): Promise<RecallEntry[]> {
  const start = new Date(now.getTime() - windowDays * 86_400_000);
  const entries = await timeEntryRepository.getEntriesForRange(
    start.toISOString(),
    now.toISOString(),
    now.toISOString()
  );
  // getEntriesForRange returns chronological; keep the most recent `cap` reflections.
  return toRecallEntries(entries).slice(-cap);
}
