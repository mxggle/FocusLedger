import { actionPromptSpecs } from "./actions";
import type { AssistantContext, ContextTask } from "./types";
import type {
  CalibrationStat,
  EstimationCalibration,
  RetrospectiveInsights,
  SlipAnalysis,
  WeeklyReview
} from "../../retrospect/types";

function describeTask(task: ContextTask): string {
  const estimate = task.estimatedMinutes != null ? `, est ${task.estimatedMinutes}m` : "";
  return `- [${task.id}] "${task.title}" (${task.status}, ${task.priority}${estimate})`;
}

function renderContext(ctx: AssistantContext): string {
  const lines: string[] = [`Current date (the day the user is viewing): ${ctx.today}`];

  lines.push(
    ctx.categories.length > 0
      ? `Categories: ${ctx.categories.map((c) => `${c.name} [${c.id}]`).join(", ")}`
      : "Categories: none"
  );

  lines.push(
    ctx.tasks.length > 0
      ? ["Today's tasks:", ...ctx.tasks.map(describeTask)].join("\n")
      : "Today's tasks: none — the user has no tasks scheduled today."
  );

  if (ctx.backlog.length > 0) {
    lines.push(["Backlog (unscheduled):", ...ctx.backlog.map(describeTask)].join("\n"));
  }

  return lines.join("\n");
}

function renderActionCatalog(): string {
  return actionPromptSpecs()
    .map((spec) => `- ${spec.name}: use when ${spec.when}. params: ${spec.params}`)
    .join("\n");
}

function describeCalibrationStat(stat: CalibrationStat): string {
  const pct = Math.round(stat.ratio * 100);
  const flag = stat.confidence === "low" ? " (low confidence)" : "";
  return `${stat.scope}: actual is ${pct}% of estimate (ratio ${stat.ratio.toFixed(2)}, ${stat.sampleSize} tasks)${flag}`;
}

function renderCalibration(calibration: EstimationCalibration): string[] {
  if (!calibration.overall) return [];
  const lines = [`Estimation calibration — ${describeCalibrationStat(calibration.overall)}`];
  for (const stat of calibration.byCategory) {
    lines.push(`  • ${describeCalibrationStat(stat)}`);
  }
  return lines;
}

function renderSlips(slips: SlipAnalysis): string[] {
  if (slips.items.length === 0 && slips.blockerThemes.length === 0) return [];
  const lines = ["Slips (stuck or abandoned work):"];
  for (const item of slips.items) {
    lines.push(`  • "${item.title}" — ${item.kind}, ${item.ageDays}d old [${item.taskId}]`);
  }
  if (slips.moreCount > 0) lines.push(`  • …and ${slips.moreCount} more`);
  if (slips.blockerThemes.length > 0) {
    lines.push(`Recurring blockers: ${slips.blockerThemes.map((t) => `${t.keyword} (${t.count})`).join(", ")}`);
  }
  return lines;
}

function renderWeekly(weekly: WeeklyReview): string[] {
  const lines = [
    `This week vs last week: ${weekly.thisWeekMinutes}m vs ${weekly.lastWeekMinutes}m (${weekly.deltaMinutes >= 0 ? "+" : ""}${weekly.deltaMinutes}m), completed ${weekly.completedCount}, dropped ${weekly.droppedCount}`
  ];
  for (const delta of weekly.categoryDeltas) {
    lines.push(`  • ${delta.category}: ${delta.thisWeekMinutes}m (${delta.deltaMinutes >= 0 ? "+" : ""}${delta.deltaMinutes}m)`);
  }
  return lines;
}

function renderRetro(retro: RetrospectiveInsights): string {
  return [
    `History & patterns (last ${retro.windowDays} days — pre-computed, do not recalculate):`,
    ...renderCalibration(retro.calibration),
    ...renderSlips(retro.slips),
    ...renderWeekly(retro.weekly)
  ].join("\n");
}

const RETRO_RULES = [
  "Using history & patterns:",
  "- When the user asks how a day/week went or why things slip, ground your answer in the numbers above — cite them plainly.",
  "- When proposing or adjusting time estimates, apply the relevant category calibration ratio (or the overall ratio) so the plan reflects how long work actually takes.",
  "- If a figure is marked low confidence, hedge — say there isn't much history yet rather than over-claiming.",
  "- Never invent numbers that are not shown above."
].join("\n");

export function buildAssistantSystemPrompt(ctx: AssistantContext): string {
  const lines = [
    'You are the Yolo Assistant, a focused day-planning companion inside Yolo, a desktop app whose motto is "make your time count".',
    "You help the user plan and adjust their day. You never invent tasks the user did not ask for, and you reference existing tasks by the id shown in brackets.",
    "",
    "You respond with a SINGLE JSON object and nothing else — no prose outside it, no markdown code fences. The shape is:",
    '{ "reply": "<short conversational message in Markdown>", "actions": [ { "type": "<action>", ...params } ] }',
    "",
    "Rules for actions:",
    "- Only propose an action when the user clearly wants a change. For questions or advice, return an empty actions array.",
    "- Every action you propose will be shown to the user for explicit approval before anything happens — so propose freely but accurately.",
    "- Use the exact task ids from the context below. Never guess an id.",
    "- Keep `reply` brief and warm, like a coach who respects the user's time. Summarize what you are proposing; do not restate every field.",
    "",
    "Available actions:",
    renderActionCatalog(),
    "",
    "Current context:",
    renderContext(ctx)
  ];

  if (ctx.retro) {
    lines.push("", renderRetro(ctx.retro), "", RETRO_RULES);
  }

  return lines.join("\n");
}
