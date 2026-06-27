import type { Category, Task, TaskPriority, TaskStatus } from "../../../../types";
import type { RecallEntry } from "../recallHistory";
import type { MemoryEntry, MemoryKind } from "../memory/types";
import type { PermissionLevel } from "../agentTools/types";

export const FIXED_TODAY = "2026-06-23";
export const FIXED_TOMORROW = "2026-06-24";
export const FIXED_OVERDUE = "2026-06-20";
export const FIXED_YESTERDAY = "2026-06-22";

export const DEFAULT_EVAL_SETTINGS = {
  aiProvider: "anthropic" as const,
  aiApiKey: "test-key",
  aiModel: "",
  aiBaseUrl: ""
};

const HEX_ID = "e5f24bfb-5b67-49a7-be01-8c4090dc3388";

let taskCounter = 0;
export function makeTask(overrides: Partial<Task> & { id?: string } = {}): Task {
  taskCounter += 1;
  const seq = String(taskCounter).padStart(2, "0");
  return {
    id: overrides.id ?? `task${HEX_ID.slice(0, 8)}-${seq}-4aaa-8aaa-${HEX_ID.slice(20)}`,
    title: `Task ${seq}`,
    description: null,
    category_id: null,
    status: "todo",
    priority: "medium",
    estimated_minutes: null,
    due_date: FIXED_TODAY,
    template_id: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    created_at: `${FIXED_TODAY}T09:00:00Z`,
    updated_at: "u0",
    completed_at: null,
    dropped_at: null,
    ...overrides
  };
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Deep Work",
    color: null,
    created_at: `${FIXED_TODAY}T00:00:00Z`,
    updated_at: `${FIXED_TODAY}T00:00:00Z`,
    ...overrides
  };
}

export function todayScheduledTask(overrides: Partial<Task> = {}): Task {
  return makeTask({
    title: "Write launch deck",
    priority: "high",
    planned_start_time: "09:00",
    planned_end_time: "09:30",
    due_date: FIXED_TODAY,
    ...overrides
  });
}

export function todaySecondTask(overrides: Partial<Task> = {}): Task {
  return makeTask({
    title: "Review PRs",
    priority: "medium",
    planned_start_time: "10:00",
    planned_end_time: "11:00",
    due_date: FIXED_TODAY,
    ...overrides
  });
}

export function todayStartOnlyTask(overrides: Partial<Task> = {}): Task {
  return makeTask({ title: "Standup", planned_start_time: "09:30", planned_end_time: null, due_date: FIXED_TODAY, ...overrides });
}

export function todayEndOnlyTask(overrides: Partial<Task> = {}): Task {
  return makeTask({ title: "Demo prep", planned_start_time: null, planned_end_time: "15:00", due_date: FIXED_TODAY, ...overrides });
}

export function todayNoTimeTask(overrides: Partial<Task> = {}): Task {
  return makeTask({ title: "Read spec", planned_start_time: null, planned_end_time: null, due_date: FIXED_TODAY, ...overrides });
}

export function backlogTask(overrides: Partial<Task> = {}): Task {
  return makeTask({ title: "Backlog item", priority: "low", due_date: null, ...overrides });
}

export function overdueTask(overrides: Partial<Task> = {}): Task {
  return makeTask({ title: "Overdue report", due_date: FIXED_OVERDUE, ...overrides });
}

export function taskWithStatus(status: TaskStatus, overrides: Partial<Task> = {}): Task {
  return makeTask({ status, ...overrides });
}

export const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
export const STATUSES: TaskStatus[] = ["todo", "doing", "paused", "done", "dropped"];
export const PERMISSION_LEVELS: PermissionLevel[] = ["plan", "ask", "auto"];

export const EXISTING_CATEGORY = makeCategory({ id: "cat-dev", name: "Dev" });
export const NO_CATEGORY = null;
export const CATEGORY_TO_CREATE = "Research";

export function recallWithBlocker(overrides: Partial<RecallEntry> = {}): RecallEntry {
  return {
    date: FIXED_OVERDUE,
    taskTitle: "Japanese practice",
    category: "Learning",
    note: "Skipped again",
    blocker: "Too tired after dinner",
    nextAction: "Switch to mornings",
    ...overrides
  };
}

export function recallWithNextAction(overrides: Partial<RecallEntry> = {}): RecallEntry {
  return {
    date: FIXED_YESTERDAY,
    taskTitle: "Launch deck",
    category: "Dev",
    note: "Drafted outline",
    blocker: null,
    nextAction: "Add metrics slide",
    ...overrides
  };
}

export function emptyRecall(overrides: Partial<RecallEntry> = {}): RecallEntry {
  return { date: FIXED_TODAY, taskTitle: "Untitled", category: null, note: null, blocker: null, nextAction: null, ...overrides };
}

let memCounter = 0;
export function makeMemory(overrides: Partial<MemoryEntry> & { text: string }): MemoryEntry {
  memCounter += 1;
  return {
    id: `mem-${memCounter}`,
    kind: "preference",
    pinned: false,
    status: "active",
    sourceMessageId: null,
    useCount: 0,
    lastUsedAt: null,
    createdAt: `${FIXED_TODAY}T00:00:00Z`,
    updatedAt: `${FIXED_TODAY}T00:00:00Z`,
    ...overrides
  };
}

export function activeMemory(text = "Prefers mornings for deep work"): MemoryEntry {
  return makeMemory({ text });
}

export function pinnedMemory(text = "Batches admin on Friday afternoons"): MemoryEntry {
  return makeMemory({ text, pinned: true });
}

export function archivedMemory(text = "Old role title"): MemoryEntry {
  return makeMemory({ text, status: "archived" });
}

export function duplicateMemory(text = "Prefers mornings for deep work"): MemoryEntry {
  return makeMemory({ text, useCount: 3 });
}

export function contradictoryMemory(text = "Prefers evenings for deep work"): MemoryEntry {
  return makeMemory({ text, kind: "preference" as MemoryKind });
}

export const ANTHROPIC_TEXT_PAYLOAD = {
  content: [{ type: "text", text: "Here is your plan for the day." }]
};

export const OPENAI_TEXT_PAYLOAD = {
  choices: [{ message: { content: "Here is your plan for the day." } }]
};

export const GEMINI_TEXT_PAYLOAD = {
  candidates: [{ content: { parts: [{ text: "Here is your plan for the day." }] } }]
};

export const GEMINI_FUNCTION_CALL_PAYLOAD = {
  candidates: [
    {
      content: {
        parts: [
          { functionCall: { name: "list_tasks", args: { scope: "today" } } },
          { functionCall: { name: "update_task", args: { task_id: "task-1", planned_start_time: "09:30" } } }
        ]
      }
    }
  ]
};

export const EMPTY_RESPONSE_PAYLOAD = { content: [], choices: [], candidates: [] };

export const PROVIDER_401_PAYLOAD = { error: { message: "invalid x-api-key" } };
export const PROVIDER_429_PAYLOAD = { error: { message: "rate limit exceeded" } };
