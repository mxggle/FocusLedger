import type { Category, Task } from "../../../types";
import type { AssistantContext, ContextTask } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";

const BACKLOG_CAP = 30;

/** Just the fields the builder reads from taskStore — keeps it test-friendly. */
export type AssistantStoreSnapshot = {
  selectedDate: string;
  tasks: Task[];
  backlogTasks: Task[];
  categories: Category[];
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
  return {
    // The day the user is currently viewing (selectedDate), which the assistant treats as "today".
    today: snapshot.selectedDate,
    categories: snapshot.categories.map((category) => ({ id: category.id, name: category.name })),
    tasks: snapshot.tasks.map(toContextTask),
    backlog: snapshot.backlogTasks.slice(0, BACKLOG_CAP).map(toContextTask),
    ...(insights && insights.hasData ? { retro: insights } : {})
  };
}
