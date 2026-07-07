import type { Task } from "../../../../types";
import type { AgentToolDeps } from "./types";

/** Hex chars of the uuid kept in model-facing short ids ("task_" + 8). */
const SHORT_UUID_CHARS = 8;
/** Shortest id fragment accepted for prefix resolution — below this, a mangled
 * or hallucinated id could accidentally hit an unrelated task. */
const MIN_PREFIX_CHARS = 6;
/** Shortest shared prefix before a task is offered as a "closest match". */
const MIN_CANDIDATE_PREFIX = 4;
const MAX_CANDIDATES = 3;

/** Lowercased id with the "task_" prefix and uuid dashes removed, so refs
 * compare the same whether the model kept, dropped, or reflowed either. */
function bareId(ref: string): string {
  const lower = ref.trim().toLowerCase();
  const unprefixed = lower.startsWith("task_") ? lower.slice("task_".length) : lower;
  return unprefixed.replace(/-/g, "");
}

/** Short, transcription-friendly form of a task id, e.g. "task_e41f3a2b".
 * This is what every model-facing surface shows; resolveTaskRef accepts it.
 * Non-canonical ids pass through unchanged. */
export function shortTaskId(id: string): string {
  if (!/^task_[0-9a-f]{8}-/i.test(id)) return id;
  return `task_${id.slice("task_".length, "task_".length + SHORT_UUID_CHARS)}`;
}

/**
 * Resolve a model-supplied task reference: exact id, short id or unique id
 * prefix (with or without the "task_" prefix or uuid dashes), or unique exact
 * title. Models — especially smaller ones — reliably mangle 41-char ids when
 * copying them into tool calls, so writes must not hinge on a perfect
 * transcription. An ambiguous reference resolves to nothing rather than
 * guessing.
 */
export function resolveTaskRef(tasks: Task[], ref: string): Task | undefined {
  const needle = ref.trim();
  if (!needle) return undefined;

  const exact = tasks.find((task) => task.id === needle);
  if (exact) return exact;

  const bare = bareId(needle);
  if (bare.length >= MIN_PREFIX_CHARS) {
    const byPrefix = tasks.filter((task) => bareId(task.id).startsWith(bare));
    if (byPrefix.length === 1) return byPrefix[0];
  }

  const lower = needle.toLowerCase();
  const byTitle = tasks.filter((task) => task.title.trim().toLowerCase() === lower);
  if (byTitle.length === 1) return byTitle[0];

  return undefined;
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let len = 0;
  while (len < max && a[len] === b[len]) len++;
  return len;
}

/** Rank tasks by how plausibly `ref` was meant to be them: a long shared id
 * prefix (a garbled copy keeps its head) or a title mention in either
 * direction (models often decorate a title with annotations). */
function closestTasks(tasks: Task[], ref: string): Task[] {
  const bare = bareId(ref);
  const lower = ref.trim().toLowerCase();
  return tasks
    .map((task) => {
      const prefix = commonPrefixLength(bare, bareId(task.id));
      const title = task.title.trim().toLowerCase();
      const titleHit =
        (lower.length >= 3 && title.includes(lower)) || (title.length >= 3 && lower.includes(title)) ? 100 : 0;
      return { task, score: (prefix >= MIN_CANDIDATE_PREFIX ? prefix : 0) + titleHit };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.task);
}

/**
 * Error for an unresolvable task reference, carrying recovery material: the
 * closest candidate ids, so the model can correct itself in the next step
 * instead of giving up or re-sending the same mangled id.
 */
export function unknownTaskRefError(tasks: Task[], ref: string): string {
  const candidates = closestTasks(tasks, ref)
    .map((task) => `[${shortTaskId(task.id)}] "${task.title}"`)
    .join(", ");
  const hint = candidates.length > 0 ? ` Closest matches: ${candidates}.` : "";
  return `Unknown task_id "${ref}".${hint} Copy the bracketed id exactly as shown by list_tasks or the context — never retype it from memory.`;
}

/** Resolve or produce the standard unknown-id error, for tool execute bodies. */
export function requireTask(deps: AgentToolDeps, ref: string): { task: Task } | { error: string } {
  const tasks = deps.store.getAllTasks();
  const task = resolveTaskRef(tasks, ref);
  return task ? { task } : { error: unknownTaskRefError(tasks, ref) };
}
