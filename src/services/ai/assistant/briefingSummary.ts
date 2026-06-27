import type { DayBriefing } from "./dayBriefing";

export type BriefingTone = "info" | "warn" | "good";
export type BriefingCta = { label: string; prompt: string };
export type BriefingSummary = {
  headline: string;
  tone: BriefingTone;
  cta: BriefingCta | null;
};

/** 90 -> "1h 30m", 60 -> "1h", 45 -> "45m", 0 -> "0m". Never negative. */
export function formatMinutes(total: number): string {
  if (total <= 0) return "0m";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

/** Turn the computed day briefing into fixed, human copy for the banner.
 *  Deterministic — no model involved. */
export function summarizeBriefing(b: DayBriefing): BriefingSummary {
  const scheduled = formatMinutes(b.scheduledMinutes);
  const target = formatMinutes(b.targetMinutes);

  switch (b.status) {
    case "overcommitted":
      return {
        headline: `Overcommitted — ${scheduled} scheduled vs your ${target} target (over by ${formatMinutes(b.overcommitMinutes)}).`,
        tone: "warn",
        cta: { label: "Trim my day", prompt: "I'm overcommitted today — what should I defer?" }
      };
    case "empty":
      return {
        headline:
          b.backlogCount > 0
            ? `Nothing scheduled today — ${b.backlogCount} item${b.backlogCount === 1 ? "" : "s"} waiting in your backlog.`
            : "Nothing scheduled today.",
        tone: "info",
        cta: b.backlogCount > 0 ? { label: "Plan my day", prompt: "Plan my day" } : null
      };
    case "light":
      return {
        headline: `Light day — ${scheduled} of your ${target} target planned.`,
        tone: "info",
        cta: b.backlogCount > 0 ? { label: "Fill from backlog", prompt: "Fill out my day from the backlog" } : null
      };
    case "balanced":
    default:
      return {
        headline: `On track — ${scheduled} of your ${target} target planned.`,
        tone: "good",
        cta: null
      };
  }
}
