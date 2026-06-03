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

async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    return false;
  }

  if (window.Notification.permission === "granted") {
    return true;
  }

  if (window.Notification.permission === "denied") {
    return false;
  }

  const permission = await window.Notification.requestPermission();
  return permission === "granted";
}

function sendSystemNotification({
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
  if (!("Notification" in window) || window.Notification.permission !== "granted") {
    return;
  }

  try {
    const notificationOptions: NotificationOptions & { renotify?: boolean; requireInteraction?: boolean } = {
      body,
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
  const pauseActiveTask = useTaskStore((state) => state.pauseActiveTask);
  const completeTask = useTaskStore((state) => state.completeTask);
  const rescheduleTask = useTaskStore((state) => state.rescheduleTask);
  const moveTaskToBacklog = useTaskStore((state) => state.moveTaskToBacklog);
  const skipPlannedTask = useTaskStore((state) => state.skipPlannedTask);
  const addToast = useUiStore((state) => state.addToast);
  const [now, setNow] = useState(() => new Date());
  const permissionReadyRef = useRef(false);
  const permissionWarningShownRef = useRef(false);
  const notifiedKeysRef = useRef(new Set<string>());
  const snoozedUntilRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!enableNotifications || !initialized) {
      return;
    }

    setNow(new Date());
    const intervalId = window.setInterval(() => setNow(new Date()), REMINDER_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [enableNotifications, initialized]);

  useEffect(() => {
    if (!enableNotifications || !initialized || permissionReadyRef.current) {
      return;
    }

    void requestNotificationPermission().then((granted) => {
      permissionReadyRef.current = granted;
      if (!granted && !permissionWarningShownRef.current) {
        permissionWarningShownRef.current = true;
        addToast({
          kind: "error",
          title: "Notifications are blocked",
          description: "Enable desktop notifications in system settings to receive task reminders."
        });
      }
    });
  }, [addToast, enableNotifications, initialized]);

  useEffect(() => {
    if (!enableNotifications || !initialized) {
      return;
    }

    const todayDate = toDateKey(now);
    const openToday = () => {
      void focusAppWindow();
      onOpenToday?.();
    };

    const snooze = (baseKey: string, minutes: number) => {
      const until = addMinutes(new Date(), minutes).getTime();
      snoozedUntilRef.current.set(baseKey, until);
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
      const body = `${description} Click to open Yolo.`;
      sendSystemNotification({
        title,
        body,
        tag: notificationKey,
        onClick: openToday
      });
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
                  onClick: (baseKey: string) => snooze(baseKey, 10)
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
              onClick: (baseKey: string) => snooze(baseKey, 10)
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
    tasks
  ]);
}
