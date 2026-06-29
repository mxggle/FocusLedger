import { clarifyTool } from "./clarify";
import { completeTaskTool } from "./completeTask";
import { createTaskTool } from "./createTask";
import { dailySummaryTool } from "./dailySummary";
import { dropTaskTool } from "./dropTask";
import { findFreeSlotsTool } from "./findFreeSlots";
import { getCalibrationTool } from "./getCalibration";
import { getTaskTool } from "./getTask";
import { listCategoriesTool } from "./listCategories";
import { listTasksTool } from "./listTasks";
import { moveToBacklogTool } from "./moveToBacklog";
import { pauseTaskTool } from "./pauseTask";
import { recallTool } from "./recall";
import { recallConversationsTool } from "./recallConversations";
import { searchTasksTool } from "./searchTasks";
import { startTaskTool } from "./startTask";
import type { AgentTool } from "./types";
import { updateTaskTool } from "./updateTask";
import type { ChatToolSpec } from "../../providers";

export const AGENT_TOOLS: AgentTool[] = [
  listTasksTool,
  getTaskTool,
  searchTasksTool,
  listCategoriesTool,
  getCalibrationTool,
  findFreeSlotsTool,
  recallTool,
  recallConversationsTool,
  dailySummaryTool,
  clarifyTool,
  createTaskTool,
  updateTaskTool,
  startTaskTool,
  pauseTaskTool,
  completeTaskTool,
  moveToBacklogTool,
  dropTaskTool
];

const BY_NAME = new Map(AGENT_TOOLS.map((tool) => [tool.name, tool]));

export function toolByName(name: string): AgentTool | undefined {
  return BY_NAME.get(name);
}

export const EXECUTE_PROGRAM_DESCRIPTION =
  "Run a small JavaScript program that calls the other tools as async functions (e.g. `const t = await list_tasks({scope:\"today\"}); for (const x of t.data) await update_task({task_id:x.id, ...});` then `return` a short summary). Prefer this for multi-step, bulk, or conditional work over many separate tool calls. Reads return their data; writes obey the same permission level. log(...) for debugging.";

export function renderToolCatalog(): string {
  const lines = AGENT_TOOLS.map((tool) => `- ${tool.name}: ${tool.description} params: ${tool.paramsHint}`);
  lines.push(`- execute_program: ${EXECUTE_PROGRAM_DESCRIPTION} params: code (required, JavaScript source)`);
  return lines.join("\n");
}

const STRING = { type: "string" };
const NULLABLE_STRING = { type: "string", nullable: true };
const NUMBER = { type: "number" };
const BOOLEAN = { type: "boolean" };
const PRIORITY = { type: "string", enum: ["low", "medium", "high"] };
const TASK_STATUS = { type: "string", enum: ["todo", "doing", "paused", "done", "dropped"] };
const DATE_OR_NULL = { type: "string", nullable: true };
const TIME_OR_NULL = { type: "string", nullable: true };

const NATIVE_PARAMETERS: Record<string, Record<string, unknown>> = {
  list_tasks: {
    type: "object",
    properties: {
      scope: { type: "string", enum: ["today", "backlog", "all"] },
      due_date: DATE_OR_NULL,
      status: TASK_STATUS,
      category: STRING,
      undated: BOOLEAN
    }
  },
  get_task: {
    type: "object",
    properties: { task_id: STRING },
    required: ["task_id"]
  },
  search_tasks: {
    type: "object",
    properties: { query: STRING },
    required: ["query"]
  },
  list_categories: {
    type: "object",
    properties: {}
  },
  get_calibration: {
    type: "object",
    properties: { category: STRING }
  },
  find_free_slots: {
    type: "object",
    properties: {
      duration_minutes: NUMBER,
      earliest: STRING,
      latest: STRING
    }
  },
  recall: {
    type: "object",
    properties: { query: STRING },
    required: ["query"]
  },
  recall_conversations: {
    type: "object",
    properties: { query: STRING },
    required: ["query"]
  },
  daily_summary: {
    type: "object",
    properties: { scope: STRING }
  },
  clarify: {
    type: "object",
    properties: {
      question: STRING,
      options: { type: "array", items: { type: "string" } }
    },
    required: ["question"]
  },
  create_task: {
    type: "object",
    properties: {
      title: STRING,
      description: NULLABLE_STRING,
      category: STRING,
      priority: PRIORITY,
      estimated_minutes: NUMBER,
      due_date: DATE_OR_NULL,
      planned_start_time: TIME_OR_NULL,
      planned_end_time: TIME_OR_NULL
    },
    required: ["title"]
  },
  update_task: {
    type: "object",
    properties: {
      task_id: STRING,
      title: STRING,
      description: NULLABLE_STRING,
      category: STRING,
      priority: PRIORITY,
      estimated_minutes: NUMBER,
      due_date: DATE_OR_NULL,
      planned_start_time: TIME_OR_NULL,
      planned_end_time: TIME_OR_NULL,
      status: TASK_STATUS
    },
    required: ["task_id"]
  },
  start_task: {
    type: "object",
    properties: { task_id: STRING },
    required: ["task_id"]
  },
  pause_task: {
    type: "object",
    properties: {}
  },
  complete_task: {
    type: "object",
    properties: { task_id: STRING, note: STRING },
    required: ["task_id"]
  },
  move_to_backlog: {
    type: "object",
    properties: { task_id: STRING },
    required: ["task_id"]
  },
  drop_task: {
    type: "object",
    properties: { task_id: STRING },
    required: ["task_id"]
  }
};

export function nativeToolSpecs(): ChatToolSpec[] {
  const specs = AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: NATIVE_PARAMETERS[tool.name] ?? { type: "object", properties: {} }
  }));
  specs.push({
    name: "execute_program",
    description: EXECUTE_PROGRAM_DESCRIPTION,
    parameters: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"]
    }
  });
  return specs;
}
