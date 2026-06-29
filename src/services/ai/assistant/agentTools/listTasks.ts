import { z } from "zod";
import type { Task, TaskStatus } from "../../../../types";
import { MAX_RESULTS, taskLine } from "./readHelpers";
import { resolveDueDate } from "./helpers";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const statuses: TaskStatus[] = ["todo", "doing", "paused", "done", "dropped"];
const schema = z.object({
  scope: z.enum(["today", "backlog", "all"]).optional(),
  due_date: z.string().nullable().optional(),
  status: z.enum(statuses as [TaskStatus, ...TaskStatus[]]).optional(),
  category: z.string().optional(),
  undated: z.boolean().optional()
});

function filterByScope(tasks: Task[], scope: "today" | "backlog" | "all", deps: AgentToolDeps): Task[] {
  if (scope === "today") return tasks.filter((task) => task.due_date === deps.ctx.today);
  if (scope === "backlog") return tasks.filter((task) => !task.due_date);
  return tasks;
}

function filterByCategory(tasks: Task[], category: string | undefined, deps: AgentToolDeps): Task[] {
  const cat = (category ?? "").trim().toLowerCase();
  if (!cat) return tasks;
  if (cat === "none") return tasks.filter((task) => !task.category_id);
  const match = deps.store
    .getCategories()
    .find((item) => item.id.toLowerCase() === cat || item.name.toLowerCase() === cat);
  const wantId = (match?.id ?? cat).toLowerCase();
  return tasks.filter((task) => (task.category_id ?? "").toLowerCase() === wantId);
}

export const listTasksTool: AgentTool = {
  name: "list_tasks",
  category: "read",
  destructive: false,
  description:
    'List tasks by scope, due_date, status, category, or undated/backlog state. due_date supports "today", "yesterday", "tomorrow", YYYY-MM-DD, or null for backlog. Use before bulk edits so you have exact task ids and schedule times.',
  paramsHint:
    'scope optional ("today"|"backlog"|"all", default "today"), due_date optional ("today"|"yesterday"|"tomorrow"|YYYY-MM-DD|null), status optional, category optional name/id/"none", undated optional boolean',
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      let tasks =
        args.due_date !== undefined
          ? deps.store.getAllTasks().filter((task) => task.due_date === resolveDueDate(deps, args.due_date))
          : filterByScope(deps.store.getAllTasks(), args.scope ?? "today", deps);
      if (args.status) tasks = tasks.filter((task) => task.status === args.status);
      tasks = filterByCategory(tasks, args.category, deps);
      if (args.undated === true) tasks = tasks.filter((task) => !task.due_date);

      if (tasks.length === 0) return { ok: true, summary: "list_tasks: no tasks match those filters.", data: [] };
      const shown = tasks.slice(0, MAX_RESULTS);
      const more =
        tasks.length > shown.length ? [`...and ${tasks.length - shown.length} more; narrow with filters.`] : [];
      const summary = [`list_tasks found ${tasks.length}:`, ...shown.map((task) => taskLine(task, deps)), ...more].join(
        "\n"
      );
      return { ok: true, summary, data: tasks };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid list_tasks args" };
    }
  }
};
