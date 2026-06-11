import { create } from "zustand";
import { categoryRepository, FALLBACK_CATEGORY_ID } from "../db/categoryRepository";
import { initializeDatabase } from "../db/client";
import { taskRepository } from "../db/taskRepository";
import { taskTemplateRepository } from "../db/taskTemplateRepository";
import { timeEntryRepository } from "../db/timeEntryRepository";
import { validateTaskSchedule, validateTemplateSchedule } from "../services/scheduleConflictService";
import { scheduleService } from "../services/scheduleService";
import { calculateDateRangeStats, calculateTodayStats } from "../services/statsService";
import type {
  Category,
  CreateCategoryInput,
  CreateTaskTemplateInput,
  CreateTaskInput,
  UpdateCategoryInput,
  DailyStats,
  StopSessionInput,
  Task,
  TaskTemplate,
  TimeEntry,
  TimeEntryWithTask,
  UpdateEntryDetailsInput,
  UpdateTaskTemplateInput,
  TodayStats,
  UpdateTaskInput
} from "../types";
import { getRecentDateKeys, startOfDateKey, toDateKey } from "../utils/date";
import { formatDurationCompact } from "../utils/duration";
import { useSettingsStore } from "./settingsStore";
import { useTimerStore } from "./timerStore";
import { useUiStore } from "./uiStore";

type StartTaskResult = "started" | "failed";
type StopOutcome = "paused" | "done" | "dropped";
type MutationResult = { ok: true } | { ok: false; message: string };

type TaskState = {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  selectedDate: string;
  tasks: Task[];
  backlogTasks: Task[];
  allTasks: Task[];
  scheduleTemplates: TaskTemplate[];
  categories: Category[];
  todayEntries: TimeEntryWithTask[];
  selectedDateEntries: TimeEntryWithTask[];
  historyEntries: TimeEntryWithTask[];
  activeEntry: TimeEntry | null;
  activeTask: Task | null;
  focusedTaskId: string | null;
  focusedTask: Task | null;
  closedTaskDurations: Record<string, number>;
  todayStats: TodayStats | null;
  historyStats: DailyStats[];
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  setSelectedDate: (date: string) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<MutationResult>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<MutationResult>;
  deleteTask: (id: string) => Promise<MutationResult>;
  createCategory: (input: CreateCategoryInput) => Promise<MutationResult>;
  updateCategory: (id: string, input: UpdateCategoryInput) => Promise<MutationResult>;
  deleteCategory: (id: string) => Promise<MutationResult>;
  createScheduleTemplate: (input: CreateTaskTemplateInput) => Promise<MutationResult>;
  updateScheduleTemplate: (id: string, input: UpdateTaskTemplateInput) => Promise<MutationResult>;
  deleteScheduleTemplate: (id: string) => Promise<MutationResult>;
  startTask: (taskId: string) => Promise<StartTaskResult>;
  pauseActiveTask: () => Promise<MutationResult>;
  resumeTask: (taskId: string) => Promise<StartTaskResult>;
  stopActiveTask: (outcome: StopOutcome, input: StopSessionInput) => Promise<MutationResult>;
  updateEntryDetails: (entryId: string, input: UpdateEntryDetailsInput) => Promise<MutationResult>;
  completeTask: (taskId: string, note?: string) => Promise<MutationResult>;
  dropTask: (taskId: string) => Promise<MutationResult>;
  rescheduleTask: (taskId: string, dueDate: string) => Promise<MutationResult>;
  moveTaskToBacklog: (taskId: string) => Promise<MutationResult>;
  skipPlannedTask: (taskId: string) => Promise<MutationResult>;
};

async function getClosedDurations(tasks: Task[]): Promise<Record<string, number>> {
  const entriesByTask = await Promise.all(
    tasks.map(async (task) => [task.id, await timeEntryRepository.getEntriesForTask(task.id)] as const)
  );

  return Object.fromEntries(
    entriesByTask.map(([taskId, entries]) => [
      taskId,
      entries.reduce((sum, entry) => sum + (entry.duration_seconds ?? 0), 0)
    ])
  );
}

function reportError(title: string, error: unknown): void {
  console.error(title, error);
  useUiStore.getState().addToast({
    kind: "error",
    title,
    description: error instanceof Error ? error.message : "Unknown error"
  });
}

function mutationFailure(error: unknown, fallback: string): MutationResult {
  return { ok: false, message: error instanceof Error ? error.message : fallback };
}

function minimumEstimateMinutes(elapsedSeconds: number): number {
  return Math.max(1, Math.ceil(elapsedSeconds / 60));
}

export const useTaskStore = create<TaskState>((set, get) => ({
  initialized: false,
  loading: false,
  error: null,
  selectedDate: toDateKey(),
  tasks: [],
  backlogTasks: [],
  allTasks: [],
  scheduleTemplates: [],
  categories: [],
  todayEntries: [],
  selectedDateEntries: [],
  historyEntries: [],
  activeEntry: null,
  activeTask: null,
  focusedTaskId: null,
  focusedTask: null,
  closedTaskDurations: {},
  todayStats: null,
  historyStats: [],

  initialize: async () => {
    if (get().initialized || get().loading) {
      return;
    }

    set({ loading: true, error: null });
    try {
      await initializeDatabase();
      await timeEntryRepository.repairActiveEntries();
      await useSettingsStore.getState().loadSettings();
      await get().refresh();
      set({ initialized: true, loading: false });
    } catch (error) {
      reportError("Database could not be initialized", error);
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Database initialization failed"
      });
    }
  },

  refresh: async () => {
    const selectedDate = get().selectedDate;
    const todayDate = toDateKey();
    const now = new Date();
    await scheduleService.generateTasksForDate(todayDate);

    const [tasks, backlogTasks, allTasks, scheduleTemplates, categories, todayEntries, selectedDateEntries, activeEntry] = await Promise.all([
      taskRepository.getTodayTasks(todayDate),
      taskRepository.getBacklogTasks(),
      taskRepository.getAll(),
      taskTemplateRepository.getAll(),
      categoryRepository.getAll(),
      timeEntryRepository.getEntriesForDate(todayDate, now.toISOString()),
      timeEntryRepository.getEntriesForDate(selectedDate, now.toISOString()),
      timeEntryRepository.getActiveEntry()
    ]);

    const historyDates = getRecentDateKeys(7);
    const historyStart = startOfDateKey(historyDates[0] ?? toDateKey()).toISOString();
    const historyEnd = new Date(startOfDateKey((historyDates[historyDates.length - 1] ?? toDateKey())).getTime() + 86400000).toISOString();
    const historyEntries = await timeEntryRepository.getEntriesForRange(historyStart, historyEnd, now.toISOString());
    const activeTask = activeEntry ? (await taskRepository.getById(activeEntry.task_id)) ?? null : null;

    // The Current Focus pane keeps a task while it is running OR paused, so
    // pausing no longer drops it back to the Tasks list. focusedTaskId is the
    // sticky pointer (set when a task starts, cleared on stop/done/drop); it
    // falls back to the active entry so a running session is always focused.
    const desiredFocusId = get().focusedTaskId ?? activeEntry?.task_id ?? null;
    let focusedTask: Task | null = null;
    if (desiredFocusId) {
      const candidate =
        desiredFocusId === activeTask?.id
          ? activeTask
          : (await taskRepository.getById(desiredFocusId)) ?? null;
      // Keep focus while running or paused; drop it once done, dropped,
      // relocated, or gone.
      if (candidate && (candidate.id === activeEntry?.task_id || candidate.status === "paused")) {
        focusedTask = candidate;
      }
    }
    const focusedTaskId = focusedTask?.id ?? null;

    const closedTaskDurations = await getClosedDurations([
      ...tasks,
      ...(activeTask ? [activeTask] : []),
      ...(focusedTask ? [focusedTask] : [])
    ]);
    const todayStats = calculateTodayStats({
      date: todayDate,
      tasks: allTasks,
      timeEntries: todayEntries,
      categories,
      now
    });
    const historyStats = calculateDateRangeStats({
      dates: historyDates,
      tasks: allTasks,
      timeEntries: historyEntries,
      categories,
      now
    });

    if (activeEntry) {
      useTimerStore.getState().startTicker();
    } else {
      useTimerStore.getState().stopTicker();
    }

    set({
      tasks,
      backlogTasks,
      allTasks,
      scheduleTemplates,
      categories,
      todayEntries,
      selectedDateEntries,
      historyEntries,
      activeEntry,
      activeTask,
      focusedTaskId,
      focusedTask,
      closedTaskDurations,
      todayStats,
      historyStats
    });
  },

  setSelectedDate: async (selectedDate) => {
    set({ selectedDate });
    await get().refresh();
  },

  createTask: async (input) => {
    try {
      if (!input.title.trim()) {
        throw new Error("Task title is required");
      }
      await taskRepository.createTask(input);
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Task added" });
      return { ok: true };
    } catch (error) {
      reportError("Task could not be created", error);
      return mutationFailure(error, "Task could not be created");
    }
  },

  updateTask: async (id, input) => {
    try {
      if (
        input.planned_start_time !== undefined ||
        input.planned_end_time !== undefined ||
        input.estimated_minutes !== undefined ||
        input.due_date !== undefined ||
        input.status !== undefined
      ) {
        const existingTask = get().allTasks.find((task) => task.id === id) ?? (await taskRepository.getById(id));
        if (existingTask) {
          if (input.estimated_minutes !== undefined && input.estimated_minutes !== null) {
            const elapsedSeconds = await timeEntryRepository.getTaskDurationSeconds(id);
            const minimumEstimate = minimumEstimateMinutes(elapsedSeconds);
            if (input.estimated_minutes < minimumEstimate) {
              throw new Error(
                `Estimate cannot be less than time already spent (${formatDurationCompact(elapsedSeconds)}).`
              );
            }
          }

          const tasksForValidation = get().allTasks.length > 0 ? get().allTasks : await taskRepository.getAll();
          const validation = validateTaskSchedule({ ...existingTask, ...input }, tasksForValidation, id);
          if (!validation.ok) {
            throw new Error(validation.message);
          }
        }
      }
      await taskRepository.updateTask(id, input);
      await get().refresh();
      return { ok: true };
    } catch (error) {
      reportError("Task could not be updated", error);
      return mutationFailure(error, "Task could not be updated");
    }
  },

  deleteTask: async (id) => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (activeEntry?.task_id === id) {
        await timeEntryRepository.closeEntry(activeEntry.id);
      }

      const entries = await timeEntryRepository.getEntriesForTask(id);
      if (entries.length > 0) {
        await taskRepository.updateTask(id, {
          status: "dropped",
          completed_at: null,
          dropped_at: new Date().toISOString()
        });
        await get().refresh();
        useUiStore.getState().addToast({ kind: "success", title: "Task removed; time records kept" });
        return { ok: true };
      }

      await taskRepository.deleteTask(id);
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Task deleted" });
      return { ok: true };
    } catch (error) {
      reportError("Task could not be deleted", error);
      return mutationFailure(error, "Task could not be deleted");
    }
  },

  createCategory: async (input) => {
    try {
      await categoryRepository.create(input);
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Category added" });
      return { ok: true };
    } catch (error) {
      reportError("Category could not be created", error);
      return mutationFailure(error, "Category could not be created");
    }
  },

  updateCategory: async (id, input) => {
    try {
      await categoryRepository.update(id, input);
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Category updated" });
      return { ok: true };
    } catch (error) {
      reportError("Category could not be updated", error);
      return mutationFailure(error, "Category could not be updated");
    }
  },

  deleteCategory: async (id) => {
    try {
      await categoryRepository.delete(id);
      const settingsStore = useSettingsStore.getState();
      if (settingsStore.settings.defaultCategoryId === id) {
        await settingsStore.updateSetting("defaultCategoryId", FALLBACK_CATEGORY_ID);
      }
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Category deleted" });
      return { ok: true };
    } catch (error) {
      reportError("Category could not be deleted", error);
      return mutationFailure(error, "Category could not be deleted");
    }
  },

  createScheduleTemplate: async (input) => {
    try {
      if (!input.title.trim()) {
        throw new Error("Plan title is required");
      }
      const validation = validateTemplateSchedule({ ...input, planned_start_time: input.planned_start_time ?? null, recurrence_days: input.recurrence_days ?? [] }, get().scheduleTemplates);
      if (!validation.ok) {
        throw new Error(validation.message);
      }
      await taskTemplateRepository.createTemplate(input);
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Plan item added" });
      return { ok: true };
    } catch (error) {
      reportError("Plan item could not be created", error);
      return mutationFailure(error, "Plan item could not be created");
    }
  },

  updateScheduleTemplate: async (id, input) => {
    try {
      const existingTemplate = get().scheduleTemplates.find((template) => template.id === id) ?? (await taskTemplateRepository.getById(id));
      if (existingTemplate) {
        const validation = validateTemplateSchedule({ ...existingTemplate, ...input }, get().scheduleTemplates, id);
        if (!validation.ok) {
          throw new Error(validation.message);
        }
      }
      await taskTemplateRepository.updateTemplate(id, input);
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Plan item updated" });
      return { ok: true };
    } catch (error) {
      reportError("Plan item could not be updated", error);
      return mutationFailure(error, "Plan item could not be updated");
    }
  },

  deleteScheduleTemplate: async (id) => {
    try {
      await taskTemplateRepository.deleteTemplate(id);
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Plan item deleted" });
      return { ok: true };
    } catch (error) {
      reportError("Plan item could not be deleted", error);
      return mutationFailure(error, "Plan item could not be deleted");
    }
  },

  startTask: async (taskId) => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (activeEntry && activeEntry.task_id !== taskId) {
        // Auto-pause whatever is currently running, then start the new task.
        // Drop the paused block if the switch happened before it logged
        // anything meaningful.
        const closed = await timeEntryRepository.closeEntry(activeEntry.id);
        await timeEntryRepository.discardIfTrivial(closed);
        await taskRepository.updateTask(activeEntry.task_id, { status: "paused" });
      }

      if (!activeEntry || activeEntry.task_id !== taskId) {
        await timeEntryRepository.resumeOrCreateEntry(taskId);
      }
      await taskRepository.updateTask(taskId, { status: "doing" });
      set({ focusedTaskId: taskId });
      await get().refresh();
      return "started";
    } catch (error) {
      reportError("Task could not be started", error);
      return "failed";
    }
  },

  pauseActiveTask: async () => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (!activeEntry) {
        return { ok: true };
      }
      const closed = await timeEntryRepository.closeEntry(activeEntry.id);
      await timeEntryRepository.discardIfTrivial(closed);
      await taskRepository.updateTask(activeEntry.task_id, { status: "paused" });
      await get().refresh();
      return { ok: true };
    } catch (error) {
      reportError("Task could not be paused", error);
      return mutationFailure(error, "Task could not be paused");
    }
  },

  resumeTask: async (taskId) => get().startTask(taskId),

  stopActiveTask: async (outcome, input) => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      // Stop targets the running entry, or the focused task if it is paused.
      const targetTaskId = activeEntry?.task_id ?? get().focusedTaskId;
      if (!targetTaskId) {
        return { ok: true };
      }

      if (activeEntry) {
        await timeEntryRepository.closeEntry(activeEntry.id, undefined, input);
      } else {
        // Paused focus session: no open entry, so attach the wrap-up reflection
        // to the task's most recent entry instead.
        const entries = await timeEntryRepository.getEntriesForTask(targetTaskId);
        const latest = entries[entries.length - 1];
        if (latest) {
          await timeEntryRepository.updateReflection(latest.id, input);
        }
      }

      await taskRepository.updateTask(targetTaskId, {
        status: outcome,
        completed_at: outcome === "done" ? new Date().toISOString() : null,
        dropped_at: outcome === "dropped" ? new Date().toISOString() : null
      });
      set({ focusedTaskId: null });
      await get().refresh();
      return { ok: true };
    } catch (error) {
      reportError("Session could not be stopped", error);
      return mutationFailure(error, "Session could not be stopped");
    }
  },

  updateEntryDetails: async (entryId, input) => {
    try {
      if (
        input.completion_rate !== null &&
        (!Number.isFinite(input.completion_rate) ||
          input.completion_rate < 0 ||
          input.completion_rate > 100)
      ) {
        throw new Error("Completion rate must be between 0 and 100.");
      }
      await timeEntryRepository.updateEntryDetails(entryId, input);
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Entry updated" });
      return { ok: true };
    } catch (error) {
      reportError("Entry could not be updated", error);
      return mutationFailure(error, "Entry could not be updated");
    }
  },

  completeTask: async (taskId, note) => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (activeEntry?.task_id === taskId) {
        await timeEntryRepository.closeEntry(activeEntry.id, undefined, {
          note,
          completion_rate: 100
        });
      }
      await taskRepository.updateTask(taskId, {
        status: "done",
        completed_at: new Date().toISOString(),
        dropped_at: null
      });
      await get().refresh();
      return { ok: true };
    } catch (error) {
      reportError("Task could not be completed", error);
      return mutationFailure(error, "Task could not be completed");
    }
  },

  dropTask: async (taskId) => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (activeEntry?.task_id === taskId) {
        await timeEntryRepository.closeEntry(activeEntry.id);
      }
      await taskRepository.updateTask(taskId, {
        status: "dropped",
        completed_at: null,
        dropped_at: new Date().toISOString()
      });
      await get().refresh();
      return { ok: true };
    } catch (error) {
      reportError("Task could not be dropped", error);
      return mutationFailure(error, "Task could not be dropped");
    }
  },

  rescheduleTask: async (taskId, dueDate) => {
    try {
      const task = (await taskRepository.getById(taskId)) ?? get().allTasks.find((item) => item.id === taskId);
      if (!task) {
        throw new Error("Task not found");
      }

      const plannedUpdate = task.template_id
        ? {
            template_id: null,
            planned_start_time: null,
            planned_end_time: null,
            sort_order: null
          }
        : {};
      const tasksForValidation = get().allTasks.length > 0 ? get().allTasks : await taskRepository.getAll();
      const validation = validateTaskSchedule(
        { ...task, ...plannedUpdate, due_date: dueDate, status: "todo" },
        tasksForValidation,
        taskId
      );
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (activeEntry?.task_id === taskId) {
        await timeEntryRepository.closeEntry(activeEntry.id);
      }

      await taskRepository.updateTask(taskId, {
        due_date: dueDate,
        status: "todo",
        ...plannedUpdate
      });
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Task rescheduled" });
      return { ok: true };
    } catch (error) {
      reportError("Task could not be rescheduled", error);
      return mutationFailure(error, "Task could not be rescheduled");
    }
  },

  moveTaskToBacklog: async (taskId) => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (activeEntry?.task_id === taskId) {
        await timeEntryRepository.closeEntry(activeEntry.id);
      }

      await taskRepository.updateTask(taskId, {
        due_date: null,
        status: "todo",
        planned_start_time: null,
        planned_end_time: null,
        sort_order: null,
        completed_at: null,
        dropped_at: null
      });
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Task moved to backlog" });
      return { ok: true };
    } catch (error) {
      reportError("Task could not be moved to backlog", error);
      return mutationFailure(error, "Task could not be moved to backlog");
    }
  },

  skipPlannedTask: async (taskId) => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (activeEntry?.task_id === taskId) {
        await timeEntryRepository.closeEntry(activeEntry.id);
      }
      await scheduleService.skipOccurrenceForTask(taskId);
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Plan task skipped for today" });
      return { ok: true };
    } catch (error) {
      reportError("Plan task could not be skipped", error);
      return mutationFailure(error, "Plan task could not be skipped");
    }
  }
}));
