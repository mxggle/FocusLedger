import { addDays, addMinutes } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";
import { getLiveTaskSeconds } from "../stores/timerStore";
import type { Task } from "../types";
import { parseDateKey, toDateKey } from "../utils/date";
import { formatDurationCompact } from "../utils/duration";
import { useUiStore } from "../stores/uiStore";

const REMINDER_TICK_MS = 30_000;
const START_GRACE_MINUTES = 10;
const TOAST_DURATION_MS = 20_000;

type ReminderType = "start" | "missed-start" | "estimate-overrun" | "planned-end";

type ReminderOptions = {
  onOpenToday?: () => void;
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Whether the user is currently looking at the app. When true, the in-app toast
 * is enough and we skip the OS banner to avoid double-alerting; when false (the
 * window is backgrounded or minimized) the OS banner is what reaches the user.
 */
function appIsFocused(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.visibilityState === "visible" && document.hasFocus();
}

function taskDateTime(task: Task, time: string): Date | null {
  if (!task.due_date || !time) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  const value = parseDateKey(task.due_date);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function isIncomplete(task: Task): boolean {
  return task.status !== "done" && task.status !== "dropped";
}

function reminderBaseKey(todayDate: string, taskId: string, type: ReminderType): string {
  return `${todayDate}:${taskId}:${type}`;
}

async function focusAppWindow() {
  // Prefer the Rust command: it reuses the tray's "Show" path, which is the one
  // that reliably activates the app over other apps on macOS. Fall back to the
  // JS window API (and finally window.focus) if that is unavailable.
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("focus_main_window");
      return;
    } catch (error) {
      console.warn("focus_main_window command failed, falling back", error);
    }
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const currentWindow = getCurrentWindow();
    await currentWindow.show();
    await currentWindow.unminimize();
    await currentWindow.setFocus();
  } catch {
    window.focus();
  }
}

async function sendSystemNotification({
  title,
  body,
  tag,
  onClick
}: {
  title: string;
  body: string;
  tag: string;
  onClick: () => void;
}) {
  // In the desktop app, use the Tauri notification plugin so a real OS-level
  // notification is shown. Permission is also granted via this plugin, so the
  // web Notification API (used below as a browser fallback) does not reliably
  // reflect that grant inside the Tauri webview.
  if (isTauriRuntime()) {
    try {
      const { sendNotification } = await import("@tauri-apps/plugin-notification");
      sendNotification({ title, body });
      return;
    } catch (error) {
      console.warn("System notification could not be sent", error);
      return;
    }
  }

  if (!("Notification" in window) || window.Notification.permission !== "granted") {
    return;
  }

  try {
    // Web fallback path only (the desktop banner's click is handled via the
    // plugin's onAction listener registered in useTaskReminders).
    const notificationOptions: NotificationOptions & { renotify?: boolean; requireInteraction?: boolean } = {
      body: `${body} Click to open Yolo.`,
      tag,
      renotify: true,
      requireInteraction: true
    };
    const notification = new window.Notification(title, notificationOptions);
    notification.onclick = () => {
      notification.close();
      onClick();
    };
  } catch (error) {
    console.warn("System notification could not be sent", error);
  }
}

export function useTaskReminders({ onOpenToday }: ReminderOptions = {}) {
  const enableNotifications = useSettingsStore((state) => state.settings.enableNotifications);
  const initialized = useTaskStore((state) => state.initialized);
  const tasks = useTaskStore((state) => state.tasks);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const activeTask = useTaskStore((state) => state.activeTask);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const startTask = useTaskStore((state) => state.startTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const pauseActiveTask = useTaskStore((state) => state.pauseActiveTask);
  const completeTask = useTaskStore((state) => state.completeTask);
  const rescheduleTask = useTaskStore((state) => state.rescheduleTask);
  const moveTaskToBacklog = useTaskStore((state) => state.moveTaskToBacklog);
  const skipPlannedTask = useTaskStore((state) => state.skipPlannedTask);
  const addToast = useUiStore((state) => state.addToast);
  const [now, setNow] = useState(() => new Date());
  const notifiedKeysRef = useRef(new Set<string>());
  const snoozedUntilRef = useRef(new Map<string, number>());
  const prunedDateRef = useRef<string | null>(null);

  // Latest "open the app on Today" action, held in a ref so the OS notification
  // click listener below can stay registered once without re-subscribing.
  const openTodayRef = useRef<() => void>(() => {});
  openTodayRef.current = () => {
    void focusAppWindow();
    onOpenToday?.();
  };

  // Clicking a desktop notification (e.g. on macOS) does nothing unless we
  // listen for the plugin's action event and bring the window forward. Register
  // once for the app's lifetime.
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unregister: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const { onAction } = await import("@tauri-apps/plugin-notification");
        const listener = await onAction(() => openTodayRef.current());
        if (cancelled) {
          void listener.unregister();
        } else {
          unregister = () => void listener.unregister();
        }
      } catch (error) {
        console.warn("Could not register notification click handler", error);
      }
    })();

    return () => {
      cancelled = true;
      unregister?.();
    };
  }, []);

  useEffect(() => {
    if (!enableNotifications || !initialized) {
      return;
    }

    setNow(new Date());
    const intervalId = window.setInterval(() => setNow(new Date()), REMINDER_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [enableNotifications, initialized]);

  useEffect(() => {
    if (!enableNotifications || !initialized) {
      return;
    }

    const todayDate = toDateKey(now);

    // Reminder keys are all prefixed with the day they belong to. On rollover,
    // drop yesterday's bookkeeping so these refs don't grow without bound in a
    // long-running session.
    if (prunedDateRef.current !== todayDate) {
      const prefix = `${todayDate}:`;
      for (const key of notifiedKeysRef.current) {
        if (!key.startsWith(prefix)) {
          notifiedKeysRef.current.delete(key);
        }
      }
      for (const key of snoozedUntilRef.current.keys()) {
        if (!key.startsWith(prefix)) {
          snoozedUntilRef.current.delete(key);
        }
      }
      prunedDateRef.current = todayDate;
    }

    const openToday = () => {
      void focusAppWindow();
      onOpenToday?.();
    };

    const snooze = (baseKey: string, minutes: number) => {
      const until = addMinutes(new Date(), minutes).getTime();
      snoozedUntilRef.current.set(baseKey, until);
    };

    // "Continue 10m" grants more time: extend the task's budget by the given
    // minutes so the timer/overrun reflect the new target, and snooze so the
    // reminder can fire again once that extended budget is reached.
    const grantMoreTime = (task: Task, baseKey: string, minutes: number) => {
      snooze(baseKey, minutes);
      const current = task.estimated_minutes ?? 0;
      return updateTask(task.id, { estimated_minutes: current + minutes });
    };

    const grantMoreEndTime = (task: Task, baseKey: string, minutes: number) => {
      snooze(baseKey, minutes);
      const endAt = task.planned_end_time
        ? taskDateTime(task, task.planned_end_time)
        : null;
      if (!endAt) {
        return Promise.resolve();
      }
      const next = addMinutes(endAt, minutes);
      const hh = String(next.getHours()).padStart(2, "0");
      const mm = String(next.getMinutes()).padStart(2, "0");
      return updateTask(task.id, { planned_end_time: `${hh}:${mm}` });
    };

    const startWithConflictHandling = async (taskId: string) => {
      // Starting a task auto-pauses whatever is currently running.
      await startTask(taskId);
    };

    const notifyOnce = ({
      task,
      type,
      title,
      description,
      actions
    }: {
      task: Task;
      type: ReminderType;
      title: string;
      description: string;
      actions: {
        label: string;
        variant?: "primary" | "secondary" | "ghost" | "danger";
        onClick: (baseKey: string) => void | Promise<unknown>;
      }[];
    }) => {
      const baseKey = reminderBaseKey(todayDate, task.id, type);
      const snoozedUntil = snoozedUntilRef.current.get(baseKey);
      if (snoozedUntil && now.getTime() < snoozedUntil) {
        return;
      }

      const notificationKey = `${baseKey}:${snoozedUntil ?? "initial"}`;
      if (notifiedKeysRef.current.has(notificationKey)) {
        return;
      }

      notifiedKeysRef.current.add(notificationKey);
      // Only raise an OS banner when the app isn't in the foreground; otherwise
      // the in-app toast below already alerts the user (and carries the action
      // buttons the OS banner lacks), so a banner would just double up.
      if (!appIsFocused()) {
        void sendSystemNotification({
          title,
          body: description,
          tag: notificationKey,
          onClick: openToday
        });
      }
      addToast({
        kind: "info",
        title,
        description,
        durationMs: TOAST_DURATION_MS,
        actions: actions.map((action) => ({
          label: action.label,
          variant: action.variant,
          onClick: () => action.onClick(baseKey)
        }))
      });
    };

    for (const task of tasks) {
      if (!isIncomplete(task) || task.due_date !== todayDate || !task.planned_start_time) {
        continue;
      }

      const startAt = taskDateTime(task, task.planned_start_time);
      if (!startAt) {
        continue;
      }

      const elapsedSeconds = getLiveTaskSeconds(task.id, activeEntry, closedTaskDurations, now);
      const hasStarted = task.status === "doing" || task.status === "paused" || elapsedSeconds > 0;
      const startGraceEndsAt = addMinutes(startAt, START_GRACE_MINUTES);
      const sharedStartActions = [
        {
          label: "Start",
          variant: "primary" as const,
          onClick: () => startWithConflictHandling(task.id)
        },
        {
          label: "Snooze 30m",
          onClick: (baseKey: string) => snooze(baseKey, 30)
        },
        {
          label: "Tomorrow",
          onClick: () => rescheduleTask(task.id, toDateKey(addDays(now, 1)))
        }
      ];

      if (!hasStarted && now >= startAt && now < startGraceEndsAt) {
        notifyOnce({
          task,
          type: "start",
          title: "Task is ready to start",
          description: `${task.title} was planned for ${task.planned_start_time}.`,
          actions: sharedStartActions
        });
      }

      if (!hasStarted && now >= startGraceEndsAt) {
        notifyOnce({
          task,
          type: "missed-start",
          title: "Task has not started",
          description: `${task.title} is ${START_GRACE_MINUTES} minutes past its planned start.`,
          actions: [
            ...sharedStartActions,
            task.template_id
              ? {
                  label: "Skip today",
                  variant: "ghost" as const,
                  onClick: () => skipPlannedTask(task.id)
                }
              : {
                  label: "Backlog",
                  variant: "ghost" as const,
                  onClick: () => moveTaskToBacklog(task.id)
                }
          ]
        });
      }

      const endAt = task.planned_end_time ? taskDateTime(task, task.planned_end_time) : null;
      if (endAt && now >= endAt) {
        const activeEndActions =
          task.status === "doing"
            ? [
                {
                  label: "Continue 10m",
                  onClick: (baseKey: string) => grantMoreEndTime(task, baseKey, 10)
                },
                {
                  label: "Pause",
                  variant: "secondary" as const,
                  onClick: () => pauseActiveTask()
                },
                {
                  label: "Done",
                  variant: "primary" as const,
                  onClick: () => completeTask(task.id, "Completed from planned-end reminder")
                }
              ]
            : [
                {
                  label: "Start",
                  variant: "primary" as const,
                  onClick: () => startWithConflictHandling(task.id)
                },
                {
                  label: "Tomorrow",
                  onClick: () => rescheduleTask(task.id, toDateKey(addDays(now, 1)))
                }
              ];

        notifyOnce({
          task,
          type: "planned-end",
          title: "Planned time is ending",
          description: `${task.title} was planned to end at ${task.planned_end_time}.`,
          actions: activeEndActions
        });
      }
    }

    if (activeTask && activeEntry && activeTask.estimated_minutes) {
      const elapsedSeconds = getLiveTaskSeconds(activeTask.id, activeEntry, closedTaskDurations, now);
      const estimateSeconds = activeTask.estimated_minutes * 60;

      if (elapsedSeconds >= estimateSeconds) {
        notifyOnce({
          task: activeTask,
          type: "estimate-overrun",
          title: "Task is over estimate",
          description: `${activeTask.title} has used ${formatDurationCompact(elapsedSeconds)} of a ${activeTask.estimated_minutes} min estimate.`,
          actions: [
            {
              label: "Continue 10m",
              onClick: (baseKey: string) => grantMoreTime(activeTask, baseKey, 10)
            },
            {
              label: "Pause",
              variant: "secondary" as const,
              onClick: () => pauseActiveTask()
            },
            {
              label: "Done",
              variant: "primary" as const,
              onClick: () => completeTask(activeTask.id, "Completed from estimate reminder")
            }
          ]
        });
      }
    }
  }, [
    activeEntry,
    activeTask,
    addToast,
    closedTaskDurations,
    completeTask,
    enableNotifications,
    initialized,
    moveTaskToBacklog,
    now,
    onOpenToday,
    pauseActiveTask,
    rescheduleTask,
    skipPlannedTask,
    startTask,
    tasks,
    updateTask
  ]);
}
