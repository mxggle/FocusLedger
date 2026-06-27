import type { Task } from "../../../types";
import type { ToolCallRecord } from "./agentTools/types";

type DisplayDetails = {
  summary: string;
  action: string;
  targetTitle?: string;
  detail?: string;
};

const TASK_ID_RE = /\s*\[(?:task[_-]?)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]/gi;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringArg(args: unknown, key: string): string | undefined {
  const value = asRecord(args)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function taskTitleFromArgs(args: unknown, tasks: Task[]): string | undefined {
  const taskId = stringArg(args, "task_id");
  if (!taskId) return undefined;
  return tasks.find((task) => task.id === taskId)?.title;
}

function quotedTitleFromSummary(summary: string): string | undefined {
  return /"([^"]+)"/.exec(summary)?.[1];
}

function timeRange(args: unknown): string | undefined {
  const start = stringArg(args, "planned_start_time");
  const end = stringArg(args, "planned_end_time");
  if (start && end) return `${start}-${end}`;
  if (start) return `starts ${start}`;
  if (end) return `ends ${end}`;
  return undefined;
}

function humanizeToolName(name: string): string {
  return name
    .replace(/_task$/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function knownTitles(toolCalls: ToolCallRecord[], tasks: Task[]): string[] {
  const titles = new Set<string>();
  for (const call of toolCalls) {
    const title =
      call.targetTitle ??
      taskTitleFromArgs(call.args, tasks) ??
      (call.undo?.kind === "restore_task" ? call.undo.before.title : undefined) ??
      quotedTitleFromSummary(call.summary);
    if (title) titles.add(title);
  }
  return [...titles].sort((a, b) => b.length - a.length);
}

export function describeToolCallForDisplay(name: string, args: unknown, tasks: Task[] = []): DisplayDetails {
  const targetTitle = name === "create_task" ? stringArg(args, "title") : taskTitleFromArgs(args, tasks);
  const range = timeRange(args);

  if (name === "create_task") {
    return {
      action: "Create",
      targetTitle,
      detail: range,
      summary: targetTitle ? `Create "${targetTitle}"${range ? ` at ${range}` : ""}` : "Create task"
    };
  }

  if (name === "update_task") {
    const action = range ? "Reschedule" : "Update";
    return {
      action,
      targetTitle,
      detail: range,
      summary: targetTitle ? `${action} "${targetTitle}"${range ? ` to ${range}` : ""}` : "Update task"
    };
  }

  if (name === "start_task") {
    return { action: "Start", targetTitle, summary: targetTitle ? `Start "${targetTitle}"` : "Start task" };
  }

  if (name === "complete_task") {
    return { action: "Complete", targetTitle, summary: targetTitle ? `Complete "${targetTitle}"` : "Complete task" };
  }

  if (name === "move_to_backlog") {
    return {
      action: "Move",
      targetTitle,
      detail: "to backlog",
      summary: targetTitle ? `Move "${targetTitle}" to backlog` : "Move task to backlog"
    };
  }

  if (name === "drop_task") {
    return { action: "Drop", targetTitle, summary: targetTitle ? `Drop "${targetTitle}"` : "Drop task" };
  }

  if (name === "pause_task") {
    return { action: "Pause", summary: "Pause current focus" };
  }

  return { action: humanizeToolName(name), targetTitle, summary: targetTitle ? `${humanizeToolName(name)} "${targetTitle}"` : humanizeToolName(name) };
}

export function toolCallDisplay(call: ToolCallRecord, tasks: Task[] = []): DisplayDetails {
  const generated = describeToolCallForDisplay(call.name, call.args, tasks);
  const targetTitle =
    call.targetTitle ??
    generated.targetTitle ??
    (call.undo?.kind === "restore_task" ? call.undo.before.title : undefined) ??
    quotedTitleFromSummary(call.summary);
  const summary = call.summary === call.name || call.summary.trim().length === 0 ? generated.summary : call.summary;

  return {
    ...generated,
    targetTitle,
    summary
  };
}

export function formatAssistantContentForDisplay(
  content: string,
  toolCalls: ToolCallRecord[] = [],
  tasks: Task[] = []
): string {
  let next = content.replace(TASK_ID_RE, "");

  for (const title of knownTitles(toolCalls, tasks)) {
    const escaped = escapeRegExp(title);
    next = next.replace(new RegExp(`["“]${escaped}["”]`, "g"), `**${title}**`);
  }

  return next;
}
