import { z } from "zod";
import type { Reflection } from "../repositories/timeEntryRepository.js";

/**
 * Wrap-up fields shared by the finishing tools (`complete_task`, `drop_task`).
 * They land on the closing time entry as the session's stop-note.
 */
export const reflectionShape = {
  note: z.string().optional().describe("What got done in this session"),
  blocker: z.string().optional().describe("What got in the way, if anything"),
  next_action: z.string().optional().describe("The concrete next step, if the work continues"),
  completion_rate: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe("How complete the task feels, 0-100")
};

export interface ReflectionArgs {
  note?: string;
  blocker?: string;
  next_action?: string;
  completion_rate?: number;
}

export function toReflection(args: ReflectionArgs): Reflection {
  return {
    note: args.note,
    blocker: args.blocker,
    next_action: args.next_action,
    completion_rate: args.completion_rate
  };
}
