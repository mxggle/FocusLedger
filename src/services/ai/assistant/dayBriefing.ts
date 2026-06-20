import type { ContextTask } from "./types";

export type DayBriefingStatus = "empty" | "light" | "balanced" | "overcommitted";

/** Deterministic snapshot of today's load. All numbers computed in TS; the LLM
 *  only narrates them. */
export type DayBriefing = {
  scheduledMinutes: number; // sum of estimates for OPEN tasks today
  targetMinutes: number; // the user's daily focus target
  overcommitMinutes: number; // max(0, scheduled - target) when target > 0
  openCount: number; // todo/doing/paused today
  doneCount: number; // done today
  backlogCount: number;
  status: DayBriefingStatus;
};

const OPEN_STATUSES = new Set(["todo", "doing", "paused"]);
const LIGHT_FRACTION = 0.5;

export function computeDayBriefing(
  today: ContextTask[],
  backlogCount: number,
  targetMinutes: number
): DayBriefing {
  const open = today.filter((task) => OPEN_STATUSES.has(task.status));
  const scheduledMinutes = open.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0);
  const doneCount = today.filter((task) => task.status === "done").length;
  const overcommitMinutes = targetMinutes > 0 ? Math.max(0, scheduledMinutes - targetMinutes) : 0;

  let status: DayBriefingStatus;
  if (open.length === 0) {
    status = "empty";
  } else if (targetMinutes > 0 && scheduledMinutes > targetMinutes) {
    status = "overcommitted";
  } else if (targetMinutes > 0 && scheduledMinutes < targetMinutes * LIGHT_FRACTION) {
    status = "light";
  } else {
    status = "balanced";
  }

  return {
    scheduledMinutes,
    targetMinutes,
    overcommitMinutes,
    openCount: open.length,
    doneCount,
    backlogCount,
    status
  };
}
