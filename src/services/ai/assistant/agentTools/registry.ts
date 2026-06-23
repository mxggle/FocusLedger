import { completeTaskTool } from "./completeTask";
import { createTaskTool } from "./createTask";
import { dailySummaryTool } from "./dailySummary";
import { dropTaskTool } from "./dropTask";
import { getCalibrationTool } from "./getCalibration";
import { getTaskTool } from "./getTask";
import { listCategoriesTool } from "./listCategories";
import { listTasksTool } from "./listTasks";
import { moveToBacklogTool } from "./moveToBacklog";
import { pauseTaskTool } from "./pauseTask";
import { recallTool } from "./recall";
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
  recallTool,
  dailySummaryTool,
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

export function renderToolCatalog(): string {
  return AGENT_TOOLS.map((tool) => `- ${tool.name}: ${tool.description} params: ${tool.paramsHint}`).join("\n");
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
  recall: {
    type: "object",
    properties: { query: STRING },
    required: ["query"]
  },
  daily_summary: {
    type: "object",
    properties: { scope: STRING }
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
  return AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: NATIVE_PARAMETERS[tool.name] ?? { type: "object", properties: {} }
  }));
}
