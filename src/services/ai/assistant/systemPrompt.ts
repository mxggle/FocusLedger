import { buildSoulBlock } from "./soul";
import { renderMemoryBlock } from "./memory/injectMemory";
import { renderSkillBlock } from "./skills/render";
import type { AssistantContext, ContextTask } from "./types";
import { renderToolCatalog } from "./agentTools/registry";
import { shortTaskId } from "./agentTools/taskRef";
import { computeTimePulse, hhmmToMinutes, renderTimePulse } from "./timePulse";
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
  const due = task.dueDate ? `, due ${task.dueDate}` : ", no due date";
  const overdue = task.isOverdue ? ", OVERDUE" : "";
  // Short id: 41-char uuids get mangled when models copy them into tool calls.
  return `- [${shortTaskId(task.id)}] "${task.title}" (${task.status}, ${task.priority}, ${time}${estimate}${due}${overdue})`;
}

function localTimeLabel(value: string): string {
  const match = /T(\d{2}:\d{2})/.exec(value);
  return match?.[1] ?? value;
}

function renderContext(ctx: AssistantContext): string {
  const lines: string[] = [`Current date (the day the user is viewing): ${ctx.today}`];

  if (ctx.currentTime) {
    lines.push(`Current local time: ${localTimeLabel(ctx.currentTime)} (${ctx.currentTime})`);
    // Only reason about wall-clock progress when the user is actually viewing
    // today; on a past/future date "now" would be misleading.
    if (ctx.currentTime.startsWith(ctx.today)) {
      const nowMinutes = hhmmToMinutes(localTimeLabel(ctx.currentTime));
      const pulse = nowMinutes != null ? computeTimePulse(nowMinutes, ctx.tasks) : null;
      if (pulse) lines.push(renderTimePulse(pulse));
    }
  }

  lines.push(
    ctx.categories.length > 0
      ? `Categories: ${ctx.categories.map((c) => `${c.name} [${c.id}]`).join(", ")}`
      : "Categories: none"
  );

  lines.push(
    ctx.tasks.length > 0
      ? [
          "Today's tasks in the selected-day pane (includes unfinished overdue carry-over; inspect due dates):",
          ...ctx.tasks.map(describeTask)
        ].join("\n")
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
    lines.push(`  • "${item.title}" — ${item.kind}, ${item.ageDays}d old [${shortTaskId(item.taskId)}]`);
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
  ask: "Permission: ASK. You may call write tools, but every change is confirmed by the user on a card before it applies. The card is the confirmation — don't also ask in chat.",
  auto: "Permission: AUTO. Reversible changes apply immediately; destructive ones (drop_task) surface a confirmation card. The card is the confirmation — don't also ask in chat."
};

const INTENT_RULES = [
  "Understanding the user:",
  "- Reply in the language the user wrote in (e.g. Chinese → Chinese), regardless of the language of task titles or these instructions.",
  "- Resolve references like \"it\", \"that one\", \"the second one\", \"这个/那个任务\" against the tasks most recently discussed or acted on. The app injects [Tool activity ...] notes into user turns listing exactly which tasks your earlier turns touched and their ids — use those before asking.",
  "- Follow-ups inherit context: \"make it 30 minutes\" after discussing an estimate means that task's estimate; \"and tomorrow?\" after a daily summary means tomorrow's summary. Re-read the last few turns before concluding you lack information, and never re-ask for details the user already gave.",
  "- If the user says \"yes\", \"do it\", \"apply\", \"确认\" right after your changes were queued on confirmation cards (status: queued in the [Tool activity] note), do NOT call the write tools again — that would queue duplicates. Tell them to press Apply on the card. If the changes already executed, there is nothing to redo — confirm they landed.",
  "- Requests are often indirect. \"I'm swamped this afternoon\" usually means rebalance or defer; \"did I forget anything?\" means check today's plan and the backlog; \"how am I doing\" means summarize progress. Infer the productive action, state your reading in one short line, and proceed — reserve clarify for genuine forks (e.g. which of two similarly-named tasks, destructive actions).",
  "- When the user asks to undo, revert, or roll back changes YOU made (\"revert that\", \"put them back\", \"撤销\"), call revert_changes (scope \"last\" unless they say everything) — it restores the exact prior state. Never conclude it's impossible by looking at the current task list, and never rebuild the inverse edits by hand.",
  "- When the user confirms a clarify question you asked (\"yes\", \"do it\", \"好\"), immediately perform the action you offered, resolving the affected tasks from the conversation and [Tool activity] notes. Do not re-judge from the current context whether the action is still needed — the context already reflects your earlier changes.",
  ""
].join("\n");

const TOOL_PROTOCOL = [
  "How to think before acting:",
  "- For anything beyond a one-shot lookup, take a beat first: name the goal in your own words, decide what you must look up to be sure, and sketch the order of operations — then act. Don't guess at ids, times, or estimates you could verify with a read.",
  "- After tools return, reflect before continuing: did the result match what you expected? Did any write fail? Is the user's goal actually met? Adjust your plan if not, and only give the final answer once it is — don't keep calling tools out of momentum.",
  "- Task status and due date are independent. A task is overdue when its due_date is before the current date; changing status to todo does not remove overdue. To make an overdue task due today, update due_date to today.",
  "",
  "Tool-calling protocol:",
  "- When you need to call a tool, use the tool-calling API your provider exposes (function calling). When a tool is not available via the API or your provider has no native tool calling, you may instead respond with ONLY a JSON object: { \"tool_calls\": [ { \"name\": \"list_tasks\", \"args\": { \"scope\": \"today\" } } ] }.",
  "- You will receive tool results as the next message. Continue with more tool calls if needed, or give your final answer.",
  "- Final answers are plain Markdown. Do not append legacy actions JSON or wrap the reply in JSON.",
  "- Never show internal task ids, category ids, or tool names in final replies. Use task titles and human-readable times only.",
  "- [Tool activity ...] notes in the conversation are injected by the app — NEVER write one yourself. Writing a description of tool calls does nothing: changes happen ONLY through actual tool calls. Never claim a change was made unless you called the write tool this turn and saw it succeed (or it was queued on a confirmation card — then say it awaits the user's Apply).",
  "- You know the current local time from Current context. For requests like 'from now', 'current time', or '剩下的时间', use that time with today's task list and schedule fields.",
  "- Reads can gather facts. Writes may execute or be queued depending on the permission level below.",
  "- When the user clearly asks for a write — including a destructive one like dropping a task — call the tool right away. Queued and destructive calls surface a confirmation card with an Apply button; that card IS the confirmation. Never ask a separate 'are you sure / please confirm' question in chat first — it makes the user confirm twice. Only pause to ask when the request is genuinely ambiguous (then use clarify).",
  "- create_task is ONLY for genuinely new work the user wants tracked. If a request cannot be done with the available tools, say so plainly and suggest the closest supported action - never invent a task to fake completion.",
  "- When a request is ambiguous, under-specified, or could mean materially different things, call clarify with ONE focused question (optionally with suggested options) instead of guessing. This ends your turn until the user replies.",
  "- For multi-step, bulk, or conditional work (e.g. 'shift every task 30 min', 'rebalance my afternoon', 'for each overdue task ...'), prefer ONE execute_program call: write a short JavaScript program that calls the tools as async functions and loops over the results, then return a brief summary. This is faster and more reliable than emitting many separate tool calls.",
  '- Use list_tasks scope "today" for the same selected-day pane the user sees (including unfinished overdue carry-over), scope "overdue" for overdue work, or due_date for an exact date ("yesterday", "today", "tomorrow", or YYYY-MM-DD).',
  "- Describe only the fields that tool results confirm were changed. A successful status update does not imply the due date changed. For bulk work, account for every requested task and report partial completion explicitly.",
  "- Before changing many tasks, call list_tasks to fetch exact ids and current schedule times, then call update_task per affected task (or do both inside execute_program).",
  '- task_id values must be copied character-for-character from the bracketed ids in this context or a tool result (e.g. [task_1a2b3c4d]) — never reconstruct one from memory. If a tool answers "Unknown task_id", re-run list_tasks and copy the id again; when it offers "Closest matches", pick from those.',
  "- Safe text transformations are supported: when the user asks you to translate, normalize, or rewrite existing task titles/descriptions, use your language ability to produce the new text and call update_task with title or description. Do not claim the user must provide every replacement unless the source text is genuinely ambiguous.",
  "- When you reschedule several tasks, give them planned windows that do NOT overlap each other or any task you are leaving in place — a task can occupy only one slot at a time. Lay them out back-to-back in real gaps (use find_free_slots to see where the day is open). Apply them as a coherent set; the user can apply them all at once.",
  "- Before setting estimated_minutes, you may call get_calibration so estimates reflect deterministic history.",
  "- When the user asks about past work, what happened, lessons learned, or recurring blockers, call recall before answering.",
  "- When the user refers to something from an earlier chat ('like we discussed', 'the plan from before', 'what did I ask you last time'), call recall_conversations to look it up before answering.",
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
    ...(ctx.learnedSkills && ctx.learnedSkills.length > 0
      ? [renderSkillBlock(ctx.learnedSkills), ""]
      : []),
    "Write final replies as Markdown. Use tool_calls JSON only for tool turns.",
    "",
    permissionLine,
    "",
    INTENT_RULES,
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
