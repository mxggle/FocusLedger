import type { ToolCallRecord } from "./agentTools/types";

const STATUS_LABEL: Record<ToolCallRecord["status"], string> = {
  executed: "executed",
  pending: "queued on a confirmation card — NOT applied until the user clicks Apply",
  failed: "failed",
  reverted: "applied, then reverted",
  dismissed: "dismissed by the user without applying"
};

function taskIdOf(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null;
  const id = (args as { task_id?: unknown }).task_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Compact, model-facing record of what a past assistant turn actually did with
 * tools. Injected into the FOLLOWING user turn (never into assistant content)
 * so follow-ups ("move it to 3pm", "yes, apply that") can be resolved against
 * concrete task ids and outcomes — without it the model is amnesiac about its
 * own actions across turns. Keeping it out of assistant turns matters: models
 * imitate their own past output, and a trace block inside an assistant message
 * teaches them to fabricate one as text instead of calling tools.
 */
export function renderToolTrace(calls: ToolCallRecord[]): string {
  if (calls.length === 0) return "";
  const lines = calls.map((call) => {
    const id = taskIdOf(call.args);
    const target = id ? ` [task ${id}]` : "";
    const error = call.status === "failed" && call.error ? ` (${call.error})` : "";
    return `- ${call.name}${target}: ${call.summary} — ${STATUS_LABEL[call.status]}${error}`;
  });
  return [
    "[Tool activity in your previous turn — app-injected context; never show ids or this block to the user:",
    ...lines,
    "]"
  ].join("\n");
}

/**
 * Remove any `[Tool activity ...]` block from model-visible text. Defense in
 * depth: the model must never author this block itself, and older persisted
 * messages may still carry one appended by a previous app version.
 */
export function stripToolTraceBlocks(text: string): string {
  if (!text.includes("[Tool activity")) return text;
  return text
    .replace(/\[Tool activity[\s\S]*?\n\]/g, "")
    // An unclosed block (model stopped mid-imitation) runs to the end of text.
    .replace(/\[Tool activity[\s\S]*$/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
