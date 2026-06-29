import type { AppSettings } from "../types";

export type RestAfterTaskDecision = "none" | "ask" | "auto";

/**
 * Pure decision for what (if anything) to do after a focus session ends with
 * "done". Kept dependency-free so the gating is trivially testable in isolation.
 */
export function decideAfterTaskRest(
  settings: Pick<AppSettings, "restEnabled" | "restAfterTask" | "restAfterTaskMinSessionMinutes">,
  focusSeconds: number,
  alreadyResting: boolean
): RestAfterTaskDecision {
  if (alreadyResting) return "none";
  if (!settings.restEnabled || settings.restAfterTask === "off") return "none";
  if (focusSeconds < settings.restAfterTaskMinSessionMinutes * 60) return "none";
  return settings.restAfterTask === "auto" ? "auto" : "ask";
}
