import { z } from "zod";
import type { CreateTaskInput } from "../../../../types";
import { HHMM_RE, resolveCategoryId, resolveDueDate } from "./helpers";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";

const schema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  estimated_minutes: z.number().positive().optional(),
  due_date: z.string().nullable().optional(),
  planned_start_time: z.string().nullable().optional(),
  planned_end_time: z.string().nullable().optional()
});

function checkTime(value: string | null | undefined, label: string): void {
  if (typeof value === "string" && value !== "" && !HHMM_RE.test(value)) {
    throw new Error(`${label} must be HH:mm`);
  }
}

export const createTaskTool: AgentTool = {
  name: "create_task",
  category: "write",
  destructive: false,
  description:
    'Create a genuinely new task the user wants tracked. Do not use this as a fallback for unsupported requests or requests about existing tasks.',
  paramsHint:
    'title (required), description, category, priority(low|medium|high), estimated_minutes, due_date("today"|YYYY-MM-DD|null), planned_start_time("HH:mm"|null), planned_end_time("HH:mm"|null)',
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    try {
      const args = schema.parse(rawArgs);
      checkTime(args.planned_start_time, "planned_start_time");
      checkTime(args.planned_end_time, "planned_end_time");

      const input: CreateTaskInput = { title: args.title };
      if (args.description !== undefined) input.description = args.description;
      if (args.priority !== undefined) input.priority = args.priority;
      if (args.estimated_minutes !== undefined) input.estimated_minutes = args.estimated_minutes;
      if (args.due_date !== undefined) input.due_date = resolveDueDate(deps, args.due_date);
      if (args.planned_start_time !== undefined) input.planned_start_time = args.planned_start_time || null;
      if (args.planned_end_time !== undefined) input.planned_end_time = args.planned_end_time || null;
      if (args.category !== undefined) {
        const { createName, id } = resolveCategoryId(deps, args.category);
        input.category_id = id ?? (createName ? await deps.store.ensureCategory(createName) : null);
      }

      const result = await deps.store.createTask(input);
      if (!result.ok) return { ok: false, error: result.message ?? "create failed" };
      if (!result.id) return { ok: false, error: "Created task id was unavailable; cannot build undo" };

      const where = input.due_date ? `for ${input.due_date}` : "in backlog";
      return {
        ok: true,
        summary: `Created "${input.title}" ${where}`,
        undo: { kind: "delete_task", taskId: result.id }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "invalid create" };
    }
  }
};
