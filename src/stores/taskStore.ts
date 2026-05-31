import { create } from "zustand";
import { categoryRepository } from "../db/categoryRepository";
import { initializeDatabase } from "../db/client";
import { taskRepository } from "../db/taskRepository";
import { timeEntryRepository } from "../db/timeEntryRepository";
import { calculateDateRangeStats, calculateTodayStats } from "../services/statsService";
import type {
  Category,
  CreateTaskInput,
  DailyStats,
  StopSessionInput,
  Task,
  TimeEntry,
  TimeEntryWithTask,
  TodayStats,
  UpdateTaskInput
} from "../types";
import { getRecentDateKeys, startOfDateKey, toDateKey } from "../utils/date";
import { useSettingsStore } from "./settingsStore";
import { useTimerStore } from "./timerStore";
import { useUiStore } from "./uiStore";

type StartTaskResult = "started" | "active-exists";
type StopOutcome = "paused" | "done" | "dropped";

type TaskState = {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  selectedDate: string;
  tasks: Task[];
  allTasks: Task[];
  categories: Category[];
  todayEntries: TimeEntryWithTask[];
  selectedDateEntries: TimeEntryWithTask[];
  historyEntries: TimeEntryWithTask[];
  activeEntry: TimeEntry | null;
  activeTask: Task | null;
  closedTaskDurations: Record<string, number>;
  todayStats: TodayStats | null;
  historyStats: DailyStats[];
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  setSelectedDate: (date: string) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<void>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  startTask: (taskId: string, options?: { stopCurrent?: boolean }) => Promise<StartTaskResult>;
  pauseActiveTask: () => Promise<void>;
  resumeTask: (taskId: string, options?: { stopCurrent?: boolean }) => Promise<StartTaskResult>;
  stopActiveTask: (outcome: StopOutcome, input: StopSessionInput) => Promise<void>;
  completeTask: (taskId: string, note?: string) => Promise<void>;
  dropTask: (taskId: string) => Promise<void>;
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

export const useTaskStore = create<TaskState>((set, get) => ({
  initialized: false,
  loading: false,
  error: null,
  selectedDate: toDateKey(),
  tasks: [],
  allTasks: [],
  categories: [],
  todayEntries: [],
  selectedDateEntries: [],
  historyEntries: [],
  activeEntry: null,
  activeTask: null,
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
    const [tasks, allTasks, categories, todayEntries, selectedDateEntries, activeEntry] = await Promise.all([
      taskRepository.getTodayTasks(todayDate),
      taskRepository.getAll(),
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
    const closedTaskDurations = await getClosedDurations([...tasks, ...(activeTask ? [activeTask] : [])]);
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
      allTasks,
      categories,
      todayEntries,
      selectedDateEntries,
      historyEntries,
      activeEntry,
      activeTask,
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
    } catch (error) {
      reportError("Task could not be created", error);
    }
  },

  updateTask: async (id, input) => {
    try {
      await taskRepository.updateTask(id, input);
      await get().refresh();
    } catch (error) {
      reportError("Task could not be updated", error);
    }
  },

  deleteTask: async (id) => {
    try {
      await taskRepository.deleteTask(id);
      await get().refresh();
      useUiStore.getState().addToast({ kind: "success", title: "Task deleted" });
    } catch (error) {
      reportError("Task could not be deleted", error);
    }
  },

  startTask: async (taskId, options = {}) => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (activeEntry && activeEntry.task_id !== taskId) {
        if (!options.stopCurrent) {
          return "active-exists";
        }
        await timeEntryRepository.closeEntry(activeEntry.id);
        await taskRepository.updateTask(activeEntry.task_id, { status: "paused" });
      }

      if (!activeEntry || activeEntry.task_id !== taskId) {
        await timeEntryRepository.createEntry(taskId);
      }
      await taskRepository.updateTask(taskId, { status: "doing" });
      await get().refresh();
      return "started";
    } catch (error) {
      reportError("Task could not be started", error);
      return "active-exists";
    }
  },

  pauseActiveTask: async () => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (!activeEntry) {
        return;
      }
      await timeEntryRepository.closeEntry(activeEntry.id);
      await taskRepository.updateTask(activeEntry.task_id, { status: "paused" });
      await get().refresh();
    } catch (error) {
      reportError("Task could not be paused", error);
    }
  },

  resumeTask: async (taskId, options = {}) => get().startTask(taskId, options),

  stopActiveTask: async (outcome, input) => {
    try {
      const activeEntry = await timeEntryRepository.getActiveEntry();
      if (!activeEntry) {
        return;
      }

      await timeEntryRepository.closeEntry(activeEntry.id, undefined, input);
      await taskRepository.updateTask(activeEntry.task_id, {
        status: outcome,
        completed_at: outcome === "done" ? new Date().toISOString() : null,
        dropped_at: outcome === "dropped" ? new Date().toISOString() : null
      });
      await get().refresh();
    } catch (error) {
      reportError("Session could not be stopped", error);
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
    } catch (error) {
      reportError("Task could not be completed", error);
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
    } catch (error) {
      reportError("Task could not be dropped", error);
    }
  }
}));
