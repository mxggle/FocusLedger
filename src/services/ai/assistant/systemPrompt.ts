import { actionPromptSpecs } from "./actions";
import { buildSoulBlock } from "./soul";
import { toolCatalog } from "./tools";
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

  if (ctx.allTasksCount && ctx.allTasksCount > 0) {
    lines.push(`You can search all ${ctx.allTasksCount} of the user's tasks with the search_tasks tool.`);
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

const TOOL_PROTOCOL = [
  "Gathering facts before you answer (optional, up to a few rounds):",
  "- Before proposing changes you may look things up. To do so, respond with ONLY a JSON object of the form:",
  '  { "lookups": [ { "tool": "search_tasks", "query": "..." } ] }',
  "- You will then receive the results as the next message and can look up more or give your final answer.",
  '- When you are ready, respond with the final { "reply", "actions" } object as usual. Do not mix lookups and a final answer in the same message.',
  "- Before creating any task, use search_tasks to check it does not already exist; if a close duplicate exists, do not recreate it — mention the existing task id in your reply instead.",
  "- Before setting estimated_minutes, you may use get_calibration to size the estimate from real history.",
  "- When the user asks about past work, what happened, lessons learned, or recurring blockers, use recall to pull relevant notes from their logged history before answering.",
  "- To act on many tasks at once (e.g. \"categorize everything\", \"re-prioritize my backlog\"), use list_tasks to fetch the set, then propose one update_task per task. If more than ~20 tasks would change, propose the first batch and ask before continuing.",
  "",
  "Read tools available:",
  toolCatalog()
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
    "You respond with a SINGLE JSON object and nothing else — no prose outside it, no markdown code fences. The shape is:",
    '{ "reply": "<short conversational message in Markdown>", "actions": [ { "type": "<action>", ...params } ] }',
    "",
    "Rules for actions:",
    "- You are an agent: when the user asks for a change, do it. Don't ask permission for reversible work and don't make the user click to confirm safe changes.",
    "- Reversible actions (create_task, update_task, reschedule_task, move_to_backlog, complete_task, start_task) are executed immediately the moment you emit them — the user does not approve them first. So act decisively and write `reply` in the PAST tense about what you just did (e.g. \"Categorized all 19 backlog tasks under Development\", \"Moved it to tomorrow\", \"Started a focus on the report\").",
    "- Only destructive actions (drop_task — abandoning a task) wait for the user to confirm. Frame those as a proposal in `reply` (e.g. \"Want me to drop these 3?\"), not as already done.",
    "- Only emit an action when the user clearly wants a change. For questions or advice, return an empty actions array.",
    "- Use the exact task ids from the context below. Never guess an id.",
    "- Keep `reply` brief and warm, like a coach who respects the user's time. Say what you did; don't restate every field — the cards carry the detail.",
    "",
    "Handling complex or long requests:",
    "- When the user describes a goal, project, or a brain-dump of notes, decompose it into a handful of concrete, well-scoped create_task proposals — one card per task — rather than a single vague task or a wall of prose.",
    "- Give each task a clear title, a one- or two-sentence description with the key detail, a sensible priority, and a realistic estimated_minutes. Spread tasks across days with due_date when the user implies a timeframe; otherwise leave them in the backlog.",
    "- Aim for a tractable set (roughly 3–7 tasks) — enough to capture the work, not so many it overwhelms. Prefer fewer, meatier tasks over many trivial ones.",
    "- If one essential detail is missing (e.g. a hard deadline), ask a single short clarifying question in `reply` and still propose your best-guess tasks so the user has something to edit.",
    "",
    "Available actions:",
    renderActionCatalog(),
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
