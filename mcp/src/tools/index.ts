import type { AnyToolModule } from "./types.js";
import { listTasksTool } from "./listTasks.js";
import { getTaskTool } from "./getTask.js";
import { listTimeEntriesTool } from "./listTimeEntries.js";
import { dailySummaryTool } from "./dailySummary.js";
import { listCategoriesTool } from "./listCategories.js";

/**
 * The tool registry. Add a new tool by importing it and appending it here —
 * `buildServer` registers everything in this list automatically.
 */
export const toolModules: AnyToolModule[] = [
  listTasksTool,
  getTaskTool,
  listTimeEntriesTool,
  dailySummaryTool,
  listCategoriesTool
];
