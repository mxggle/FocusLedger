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
