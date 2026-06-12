import type { SqliteDatabase } from "./db/database.js";
import { createTaskRepository, type TaskRepository } from "./repositories/taskRepository.js";
import { createTimeEntryRepository, type TimeEntryRepository } from "./repositories/timeEntryRepository.js";
import { createCategoryRepository, type CategoryRepository } from "./repositories/categoryRepository.js";
import { createSummaryService, type SummaryService } from "./services/summaryService.js";
import { createSessionService, type SessionService } from "./services/sessionService.js";

/**
 * Shared dependencies handed to every tool handler.
 *
 * This is the extension seam: future AI-native tools (e.g. `daily_debrief`,
 * `plan_tomorrow`) receive the same `Context` and can pull in new collaborators
 * — add an `ai` client here and every tool can use it without touching the
 * registration plumbing.
 */
export interface Context {
  tasks: TaskRepository;
  timeEntries: TimeEntryRepository;
  categories: CategoryRepository;
  summary: SummaryService;
  session: SessionService;
}

export function createContext(db: SqliteDatabase): Context {
  const tasks = createTaskRepository(db);
  const timeEntries = createTimeEntryRepository(db);
  const categories = createCategoryRepository(db);
  const summary = createSummaryService({ tasks, timeEntries, categories });
  const session = createSessionService({ db, tasks, timeEntries });
  return { tasks, timeEntries, categories, summary, session };
}
