import type { Category, Task } from "../../../types";
import type { AssistantContext, ContextTask } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";
import type { MemoryEntry } from "./memory/types";
import type { AssistantSkill } from "./skills/types";
import { computeDayBriefing } from "./dayBriefing";
import type { PermissionLevel } from "./agentTools/types";

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
  assistantName?: string;
  assistantSoul?: string;
  learnedMemories?: MemoryEntry[];
  learnedSkills?: AssistantSkill[];
  permissionLevel?: PermissionLevel;
};

function toContextTask(task: Task, selectedDate: string): ContextTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    estimatedMinutes: task.estimated_minutes,
    categoryId: task.category_id,
    dueDate: task.due_date,
    isOverdue: Boolean(task.due_date && task.due_date < selectedDate),
    plannedStartTime: task.planned_start_time,
    plannedEndTime: task.planned_end_time
  };
}

export function buildAssistantContext(
  snapshot: AssistantStoreSnapshot,
  insights?: RetrospectiveInsights | null
): AssistantContext {
  const tasks = snapshot.tasks.map((task) => toContextTask(task, snapshot.selectedDate));
  return {
    // The day the user is currently viewing (selectedDate), which the assistant treats as "today".
    today: snapshot.selectedDate,
    categories: snapshot.categories.map((category) => ({ id: category.id, name: category.name })),
    tasks,
    backlog: snapshot.backlogTasks.slice(0, BACKLOG_CAP).map((task) => toContextTask(task, snapshot.selectedDate)),
    allTasksCount: snapshot.allTasks.length,
    assistantName: snapshot.assistantName ?? "",
    assistantSoul: snapshot.assistantSoul ?? "",
    allTaskRefs: snapshot.allTasks.map((task) => ({ id: task.id, title: task.title })),
    briefing: computeDayBriefing(tasks, snapshot.backlogTasks.length, snapshot.targetMinutes ?? 0),
    ...(snapshot.profile && snapshot.profile.trim().length > 0
      ? { profile: snapshot.profile.trim() }
      : {}),
    ...(insights && insights.hasData ? { retro: insights } : {}),
    ...(snapshot.learnedMemories && snapshot.learnedMemories.length > 0
      ? { learnedMemories: snapshot.learnedMemories }
      : {}),
    ...(snapshot.learnedSkills && snapshot.learnedSkills.length > 0
      ? { learnedSkills: snapshot.learnedSkills }
      : {}),
    ...(snapshot.permissionLevel ? { permissionLevel: snapshot.permissionLevel } : {})
  };
}
