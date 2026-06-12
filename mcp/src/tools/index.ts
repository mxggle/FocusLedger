import type { AnyToolModule } from "./types.js";
import { listTasksTool } from "./listTasks.js";
import { getTaskTool } from "./getTask.js";
import { listTimeEntriesTool } from "./listTimeEntries.js";
import { dailySummaryTool } from "./dailySummary.js";
import { listCategoriesTool } from "./listCategories.js";
import { addTaskTool } from "./addTask.js";
import { updateTaskTool } from "./updateTask.js";
import { startTaskTool } from "./startTask.js";
import { pauseTaskTool } from "./pauseTask.js";
import { completeTaskTool } from "./completeTask.js";
import { dropTaskTool } from "./dropTask.js";

/**
 * The tool registry. Add a new tool by importing it and appending it here —
 * `buildServer` registers everything in this list automatically. Tools marked
 * `writes: true` are skipped when the server runs read-only.
 */
export const toolModules: AnyToolModule[] = [
  listTasksTool,
  getTaskTool,
  listTimeEntriesTool,
  dailySummaryTool,
  listCategoriesTool,
  addTaskTool,
  updateTaskTool,
  startTaskTool,
  pauseTaskTool,
  completeTaskTool,
  dropTaskTool
];

export function toolModulesFor(options: { readonly: boolean }): AnyToolModule[] {
  return options.readonly ? toolModules.filter((tool) => !tool.writes) : toolModules;
}
