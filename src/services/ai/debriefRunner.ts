import { debriefRepository } from "../../db/debriefRepository";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import type { DailyDebrief } from "../../types";
import { toDateKey } from "../../utils/date";
import { calculateTodayStats } from "../statsService";
import { generateDebrief } from "./debriefService";
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
 * Generates and saves today's debrief from current store state. Shared by the
 * debrief dialog (manual) and the scheduler (automatic).
 */
export async function runTodayDebrief(now = new Date()): Promise<DailyDebrief> {
  const settings = useSettingsStore.getState().settings;
  const { allTasks, todayEntries, categories } = useTaskStore.getState();
  const date = toDateKey(now);

  const stats = calculateTodayStats({
    date,
    tasks: allTasks,
    timeEntries: todayEntries,
    categories,
    now
  });

  const content = await generateDebrief(settings, {
    date,
    tasks: allTasks,
    entries: todayEntries,
    stats,
    language: settings.aiLanguage
  });

  return debriefRepository.save({
    date,
    content,
    provider: settings.aiProvider,
    model: resolveModel(settings)
  });
}
