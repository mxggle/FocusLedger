import type { Category, Task } from "../../../types";
import type { AssistantContext, ContextTask } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";
import { computeDayBriefing } from "./dayBriefing";

const BACKLOG_CAP = 30;

/** Just the fields the builder reads from taskStore — keeps it test-friendly. */
export type AssistantStoreSnapshot = {
  selectedDate: string;
  tasks: Task[];
  backlogTasks: Task[];
  categories: Category[];
  allTasks: Task[];
  profile?: string;
  targetMinutes?: number;
};

function toContextTask(task: Task): ContextTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    estimatedMinutes: task.estimated_minutes,
    categoryId: task.category_id
  };
}

export function buildAssistantContext(
  snapshot: AssistantStoreSnapshot,
  insights?: RetrospectiveInsights | null
): AssistantContext {
  const tasks = snapshot.tasks.map(toContextTask);
  return {
    // The day the user is currently viewing (selectedDate), which the assistant treats as "today".
    today: snapshot.selectedDate,
    categories: snapshot.categories.map((category) => ({ id: category.id, name: category.name })),
    tasks,
    backlog: snapshot.backlogTasks.slice(0, BACKLOG_CAP).map(toContextTask),
    allTasksCount: snapshot.allTasks.length,
    briefing: computeDayBriefing(tasks, snapshot.backlogTasks.length, snapshot.targetMinutes ?? 0),
    ...(snapshot.profile && snapshot.profile.trim().length > 0
      ? { profile: snapshot.profile.trim() }
      : {}),
    ...(insights && insights.hasData ? { retro: insights } : {})
  };
}
