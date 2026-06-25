import { buildSoulBlock } from "./soul";
import { renderMemoryBlock } from "./memory/injectMemory";
import type { AssistantContext, ContextTask } from "./types";
import { renderToolCatalog } from "./agentTools/registry";
import type { PermissionLevel } from "./agentTools/types";
import type {
  CalibrationStat,
  EstimationCalibration,
  RetrospectiveInsights,
  SlipAnalysis,
  WeeklyReview
} from "../../retrospect/types";

function describeTask(task: ContextTask): string {
  const estimate = task.estimatedMinutes != null ? `, est ${task.estimatedMinutes}m` : "";
  const time =
    task.plannedStartTime && task.plannedEndTime
      ? `${task.plannedStartTime}-${task.plannedEndTime}`
      : task.plannedStartTime
        ? `${task.plannedStartTime}-?`
        : task.plannedEndTime
          ? `?-${task.plannedEndTime}`
          : "no time";
  return `- [${task.id}] "${task.title}" (${task.status}, ${task.priority}, ${time}${estimate})`;
}

function localTimeLabel(value: string): string {
  const match = /T(\d{2}:\d{2})/.exec(value);
  return match?.[1] ?? value;
}

function renderContext(ctx: AssistantContext): string {
  const lines: string[] = [`Current date (the day the user is viewing): ${ctx.today}`];

  if (ctx.currentTime) {
    lines.push(`Current local time: ${localTimeLabel(ctx.currentTime)} (${ctx.currentTime})`);
  }

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

  if (ctx.allTasksCount && ctx.allTasksCount > 0) {
    lines.push(`You can search all ${ctx.allTasksCount} of the user's tasks with the search_tasks tool.`);
  }

  return lines.join("\n");
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
  const empty =
    weekly.thisWeekMinutes === 0 &&
    weekly.lastWeekMinutes === 0 &&
    weekly.completedCount === 0 &&
    weekly.droppedCount === 0;
  if (empty) return [];
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

const MODE_LINE: Record<PermissionLevel, string> = {
  plan:
    "Permission: PLAN. Do not apply changes - explore with read tools and present a plan; your proposed changes are shown to the user for approval.",
  ask: "Permission: ASK. You may call write tools, but every change is confirmed by the user before it applies.",
  auto: "Permission: AUTO. Reversible changes apply immediately; destructive ones (drop_task) are confirmed."
};

const TOOL_PROTOCOL = [
  "Tool-calling protocol:",
  "- When you need to call a tool, use the tool-calling API your provider exposes (function calling). When a tool is not available via the API or your provider has no native tool calling, you may instead respond with ONLY a JSON object: { \"tool_calls\": [ { \"name\": \"list_tasks\", \"args\": { \"scope\": \"today\" } } ] }.",
  "- You will receive tool results as the next message. Continue with more tool calls if needed, or give your final answer.",
  "- Final answers are plain Markdown. Do not append legacy actions JSON or wrap the reply in JSON.",
  "- Never show internal task ids, category ids, or tool names in final replies. Use task titles and human-readable times only.",
  "- You know the current local time from Current context. For requests like 'from now', 'current time', or '剩下的时间', use that time with today's task list and schedule fields.",
  "- Reads can gather facts. Writes may execute or be queued depending on the permission level below.",
  "- create_task is ONLY for genuinely new work the user wants tracked. If a request cannot be done with the available tools, say so plainly and suggest the closest supported action - never invent a task to fake completion.",
  "- Before changing many tasks, call list_tasks to fetch exact ids and current schedule times, then call update_task per affected task.",
  "- Before setting estimated_minutes, you may call get_calibration so estimates reflect deterministic history.",
  "- When the user asks about past work, what happened, lessons learned, or recurring blockers, call recall before answering.",
  "",
  "Tools available:",
  renderToolCatalog()
].join("\n");

function renderBriefing(ctx: AssistantContext): string[] {
  const b = ctx.briefing;
  if (!b) return [];
  const target = b.targetMinutes > 0 ? ` vs ${b.targetMinutes}m target` : "";
  const tail =
    b.status === "overcommitted"
      ? ` — overcommitted by ${b.overcommitMinutes}m`
      : b.status === "empty"
        ? " — nothing scheduled yet"
        : b.status === "light"
          ? " — a light day"
          : "";
  return [
    "Today at a glance (pre-computed — do not recalculate):",
    `- ${b.scheduledMinutes}m scheduled${target} (${b.openCount} open, ${b.doneCount} done), ${b.backlogCount} in backlog${tail}`
  ];
}

const PROACTIVE_RULES = [
  "Being proactive about the day:",
  "- If today is overcommitted, say by how much and offer to defer or shrink the lowest-priority work — propose the specific reschedule/backlog moves.",
  "- If today is empty or light, offer to pull suitable items from the backlog rather than leaving the user idle.",
  "- When asked to plan the day, fit your proposals within the focus target, using calibrated estimates.",
  "- Keep it a brief, helpful nudge — never nag, and never act without the usual confirm cards."
].join("\n");

const RETRO_RULES = [
  "Using history & patterns:",
  "- When the user asks how a day/week went or why things slip, ground your answer in the numbers above — cite them plainly.",
  "- When proposing or adjusting time estimates, apply the relevant category calibration ratio (or the overall ratio) so the plan reflects how long work actually takes.",
  "- If a figure is marked low confidence, hedge — say there isn't much history yet rather than over-claiming.",
  "- Never invent numbers that are not shown above."
].join("\n");

export function buildAssistantSystemPrompt(ctx: AssistantContext): string {
  const permissionLine = MODE_LINE[ctx.permissionLevel ?? "auto"];
  const lines = [
    buildSoulBlock(ctx.assistantName, ctx.assistantSoul),
    "",
    ...(ctx.profile
      ? [
          "About the user (in their own words — use this to tailor proposals, estimates, and tone):",
          ctx.profile,
          ""
        ]
      : []),
    ...(ctx.learnedMemories && ctx.learnedMemories.length > 0
      ? [renderMemoryBlock(ctx.learnedMemories), ""]
      : []),
    "Write final replies as Markdown. Use tool_calls JSON only for tool turns.",
    "",
    permissionLine,
    "",
    TOOL_PROTOCOL,
    "",
    "Current context:",
    renderContext(ctx)
  ];

  if (ctx.briefing) {
    lines.push("", ...renderBriefing(ctx), "", PROACTIVE_RULES);
  }

  if (ctx.retro) {
    lines.push("", renderRetro(ctx.retro), "", RETRO_RULES);
  }

  return lines.join("\n");
}
