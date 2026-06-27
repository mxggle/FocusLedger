import { z } from "zod";
import { hhmmToMinutes } from "../timePulse";
import { computeFreeSlots, minutesToHHMM } from "../scheduleSlots";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({
  duration_minutes: z.number().positive().optional(),
  earliest: z.string().optional(),
  latest: z.string().optional()
});

const DEFAULT_DURATION = 30;
const DEFAULT_EARLIEST = 9 * 60; // 09:00
const DEFAULT_LATEST = 18 * 60; // 18:00

const BUSY_STATUSES = new Set(["todo", "doing", "paused", "done"]);

/** Read-only: find open gaps in today's schedule that can fit a block of work. */
export const findFreeSlotsTool: AgentTool = {
  name: "find_free_slots",
  category: "read",
  destructive: false,
  description:
    "Find open gaps in today's schedule that can fit a block of work, given the planned start/end times of today's tasks. Use this before scheduling or offering to fit something in.",
  paramsHint:
    'duration_minutes (optional, default 30), earliest ("HH:mm", default 09:00), latest ("HH:mm", default 18:00)',
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);

      const minDuration = args.duration_minutes ?? DEFAULT_DURATION;
      const earliest = hhmmToMinutes(args.earliest ?? "") ?? DEFAULT_EARLIEST;
      const latest = hhmmToMinutes(args.latest ?? "") ?? DEFAULT_LATEST;

      // On the real today, never offer a slot that has already passed.
      const nowMin =
        deps.ctx.currentTime && deps.ctx.currentTime.startsWith(deps.ctx.today)
          ? hhmmToMinutes(/T(\d{2}:\d{2})/.exec(deps.ctx.currentTime)?.[1] ?? "")
          : null;
      const windowStart = nowMin != null ? Math.max(earliest, nowMin) : earliest;

      const busy = deps.ctx.tasks
        .filter((task) => BUSY_STATUSES.has(task.status))
        .map((task) => ({
          start: hhmmToMinutes(task.plannedStartTime),
          end: hhmmToMinutes(task.plannedEndTime)
        }))
        .filter((b): b is { start: number; end: number } => b.start != null && b.end != null && b.end > b.start);

      const slots = computeFreeSlots(busy, windowStart, latest, minDuration);

      if (slots.length === 0) {
        return {
          ok: true,
          summary: `No open ${minDuration}m+ slot between ${minutesToHHMM(windowStart)} and ${minutesToHHMM(latest)}.`,
          data: { slots: [] }
        };
      }

      const rendered = slots.map((slot) => ({
        start: minutesToHHMM(slot.startMin),
        end: minutesToHHMM(slot.endMin),
        minutes: slot.minutes
      }));
      return {
        ok: true,
        summary: `${rendered.length} open slot${rendered.length === 1 ? "" : "s"}: ${rendered
          .map((slot) => `${slot.start}-${slot.end} (${slot.minutes}m)`)
          .join(", ")}`,
        data: { slots: rendered }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid find_free_slots" };
    }
  }
};
