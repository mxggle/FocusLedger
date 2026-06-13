import { debriefRepository } from "../../db/debriefRepository";
import { timeEntryRepository } from "../../db/timeEntryRepository";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import type { DailyDebrief, TimeEntryWithTask } from "../../types";
import { toDateKey } from "../../utils/date";
import { calculateTodayStats } from "../statsService";
import { debriefInputHash, generateDebrief, type DebriefData } from "./debriefService";
import { resolveModel } from "./providers";

/**
 * Parses `HH:mm` into today's Date; returns null for malformed values so a
 * bad setting disables the schedule instead of firing at a surprise time.
 */
export function parseTimeOfDay(time: string, reference: Date): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const result = new Date(reference);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export type AutoDebriefCheck = {
  enabled: boolean;
  time: string;
  now: Date;
  hasKey: boolean;
  hasEntries: boolean;
  alreadyGenerated: boolean;
  alreadyAttempted: boolean;
};

/**
 * Pure gate for the auto-debrief: fire once per day, at or after the chosen
 * time, only when there is something to debrief and a provider to call.
 */
export function shouldRunAutoDebrief(check: AutoDebriefCheck): boolean {
  if (!check.enabled || !check.hasKey || !check.hasEntries) return false;
  if (check.alreadyGenerated || check.alreadyAttempted) return false;
  const target = parseTimeOfDay(check.time, check.now);
  if (!target) return false;
  return check.now.getTime() >= target.getTime();
}

/**
 * Assembles the debrief input for a specific date from explicit entries plus
 * current store state (tasks, categories, language). Pure given its inputs, so
 * the runner and the page's change-detection fingerprint always agree.
 */
function buildDebriefDataForDate(
  date: string,
  entries: TimeEntryWithTask[],
  now: Date
): DebriefData {
  const settings = useSettingsStore.getState().settings;
  const { allTasks, categories } = useTaskStore.getState();

  const stats = calculateTodayStats({
    date,
    tasks: allTasks,
    timeEntries: entries,
    categories,
    now
  });

  return {
    date,
    tasks: allTasks,
    entries,
    stats,
    language: settings.aiLanguage
  };
}

/**
 * Resolves the focus sessions for a date: today reads the live store (so a
 * just-finished session counts); past days load from the repository.
 */
async function resolveEntriesForDate(date: string, now: Date): Promise<TimeEntryWithTask[]> {
  if (date === toDateKey(now)) {
    return useTaskStore.getState().todayEntries;
  }
  return timeEntryRepository.getEntriesForDate(date, now.toISOString());
}

/**
 * Fingerprint of a date's debrief inputs given its already-loaded entries. The
 * My Day page compares this to the saved debrief's hash to decide whether
 * regenerating would actually produce anything new.
 */
export function debriefInputHashForEntries(
  date: string,
  entries: TimeEntryWithTask[],
  now = new Date()
): string {
  return debriefInputHash(buildDebriefDataForDate(date, entries, now));
}

/** Today-only fingerprint wrapper backed by the live store. */
export function todayDebriefInputHash(now = new Date()): string {
  return debriefInputHashForEntries(
    toDateKey(now),
    useTaskStore.getState().todayEntries,
    now
  );
}

/**
 * Generates and saves the debrief for any date. Shared by the My Day page
 * (manual, today or a past day) and the scheduler (automatic, today).
 */
export async function runDebrief(date: string, now = new Date()): Promise<DailyDebrief> {
  const settings = useSettingsStore.getState().settings;
  const entries = await resolveEntriesForDate(date, now);
  const data = buildDebriefDataForDate(date, entries, now);

  const content = await generateDebrief(settings, data);

  return debriefRepository.save({
    date: data.date,
    content,
    provider: settings.aiProvider,
    model: resolveModel(settings),
    inputHash: debriefInputHash(data)
  });
}

/** Today-only generation wrapper used by the auto-debrief scheduler. */
export async function runTodayDebrief(now = new Date()): Promise<DailyDebrief> {
  return runDebrief(toDateKey(now), now);
}
