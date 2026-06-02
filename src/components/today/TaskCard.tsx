import { addDays } from "date-fns";
import {
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Check,
  Inbox,
  MoreHorizontal,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
  X,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { validateTaskSchedule } from "../../services/scheduleConflictService";
import { useTaskStore } from "../../stores/taskStore";
import { getLiveTaskSeconds, useTimerStore } from "../../stores/timerStore";
import { useUiStore } from "../../stores/uiStore";
import type { Task, TaskPriority } from "../../types";
import { formatDateLabel, toDateKey } from "../../utils/date";
import { formatDurationCompact } from "../../utils/duration";
import { isTaskOverdue } from "../../utils/taskGrouping";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Field, Input, Select } from "../ui/Field";

const statusClass = {
  todo: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  doing: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
  done: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200",
  dropped: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200"
};

function timeToSortOrder(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function parseEstimate(value: string): number | null {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : null;
}

function minimumEstimateMinutes(elapsedSeconds: number): number {
  return Math.max(1, Math.ceil(elapsedSeconds / 60));
}

export function TaskCard({ task }: { task: Task }) {
  const categories = useTaskStore((state) => state.categories);
  const tasks = useTaskStore((state) => state.allTasks);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const startTask = useTaskStore((state) => state.startTask);
  const completeTask = useTaskStore((state) => state.completeTask);
  const dropTask = useTaskStore((state) => state.dropTask);
  const rescheduleTask = useTaskStore((state) => state.rescheduleTask);
  const moveTaskToBacklog = useTaskStore((state) => state.moveTaskToBacklog);
  const skipPlannedTask = useTaskStore((state) => state.skipPlannedTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const confirm = useUiStore((state) => state.confirm);
  const now = useTimerStore((state) => state.now);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [estimate, setEstimate] = useState(task.estimated_minutes?.toString() ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [plannedStart, setPlannedStart] = useState(task.planned_start_time ?? "");
  const [plannedEnd, setPlannedEnd] = useState(task.planned_end_time ?? "");
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const category = categories.find((item) => item.id === task.category_id);
  const elapsedSeconds = getLiveTaskSeconds(task.id, activeEntry, closedTaskDurations, now);
  const estimateSeconds = (task.estimated_minutes ?? 0) * 60;
  const parsedEstimate = parseEstimate(estimate);
  const minimumEstimate = minimumEstimateMinutes(elapsedSeconds);
  const estimateTooSmall = parsedEstimate !== null && parsedEstimate < minimumEstimate;
  const isTodayPlanTask = Boolean(task.template_id && task.due_date === toDateKey());
  const overdue = isTaskOverdue(task, toDateKey());
  const plannedTime = task.planned_end_time
    ? `${task.planned_start_time}-${task.planned_end_time}`
    : task.planned_start_time;
  const validation = useMemo(
    () =>
      isTodayPlanTask
        ? validateTaskSchedule(
            {
              ...task,
              planned_start_time: plannedStart,
              planned_end_time: plannedEnd || null,
              estimated_minutes: parseEstimate(estimate)
            },
            tasks,
            task.id
          )
        : { ok: true as const },
    [estimate, isTodayPlanTask, plannedEnd, plannedStart, task, tasks]
  );

  useEffect(() => {
    setTitle(task.title);
    setEstimate(task.estimated_minutes?.toString() ?? "");
    setPriority(task.priority);
    setPlannedStart(task.planned_start_time ?? "");
    setPlannedEnd(task.planned_end_time ?? "");
  }, [task.id, task.title, task.estimated_minutes, task.priority, task.planned_start_time, task.planned_end_time]);

  useEffect(() => {
    if (!actionsOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActionsOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionsOpen]);

  async function handleStart() {
    const result = await startTask(task.id);
    if (result === "active-exists") {
      const confirmed = await confirm({
        title: "Start this task?",
        message: "You already have an active task.\nDo you want to pause the current task and start this one?",
        confirmLabel: "Pause and start"
      });
      if (confirmed) {
        await startTask(task.id, { stopCurrent: true });
      }
    }
  }

  async function saveEdit() {
    const result = await updateTask(task.id, {
      title,
      estimated_minutes: parseEstimate(estimate),
      priority,
      ...(isTodayPlanTask
        ? {
            planned_start_time: plannedStart,
            planned_end_time: plannedEnd || null,
            sort_order: timeToSortOrder(plannedStart)
          }
        : {})
    });
    if (!result.ok) {
      return;
    }
    setEditing(false);
  }

  async function handleDelete() {
    const confirmed = await confirm({
      title: "Delete task",
      message:
        elapsedSeconds > 0
          ? "Remove this task from today? Its time records will be kept."
          : "Delete this task?",
      confirmLabel: "Delete",
      danger: true
    });
    if (confirmed) {
      await deleteTask(task.id);
    }
  }

  async function handleMoveToBacklog() {
    const message =
      task.status === "doing"
        ? "Move this active task to backlog? The current timer will stop."
        : "Move this task back to backlog?";
    if (await confirm({ title: "Move to backlog", message, confirmLabel: "Move" })) {
      await moveTaskToBacklog(task.id);
    }
  }

  async function handleReschedule(days: number) {
    const targetDate = toDateKey(addDays(new Date(), days));
    const label = days === 1 ? "tomorrow" : "next week";
    const message =
      task.status === "doing"
        ? `Move this active task to ${label}? The current timer will stop.`
        : `Move this task to ${label}?`;
    if (await confirm({ title: `Move to ${label}`, message, confirmLabel: "Move" })) {
      await rescheduleTask(task.id, targetDate);
    }
  }

  function runMenuAction(action: () => void | Promise<void>) {
    setActionsOpen(false);
    void action();
  }

  if (editing) {
    return (
      <div className="rounded-md border bg-background p-3">
        <div className="grid gap-3">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimate">
              <Input
                type="number"
                min={minimumEstimate}
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
              />
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </Field>
          </div>
          {isTodayPlanTask ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Today start">
                <Input type="time" value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} />
              </Field>
              <Field label="Today end">
                <Input type="time" value={plannedEnd} onChange={(event) => setPlannedEnd(event.target.value)} />
              </Field>
            </div>
          ) : null}
          {!validation.ok ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {validation.message}
            </div>
          ) : null}
          {estimateTooSmall ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              Estimate cannot be less than time already spent ({formatDurationCompact(elapsedSeconds)}).
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveEdit}
              disabled={!title.trim() || estimateTooSmall || (isTodayPlanTask && (!plannedStart || !validation.ok))}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{task.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {overdue && task.due_date ? (
              <span className="font-medium text-orange-600 dark:text-orange-400">Due {formatDateLabel(task.due_date)}</span>
            ) : null}
            {plannedTime ? <span>{plannedTime}</span> : null}
            <span>{category?.name ?? "Inbox"}</span>
            {task.estimated_minutes ? <span>{task.estimated_minutes} min estimate</span> : null}
            {elapsedSeconds > 0 ? <span>{formatDurationCompact(elapsedSeconds)} actual</span> : null}
          </div>
          {(task.estimated_minutes || elapsedSeconds > 0) ? (
            <div className="mt-2 text-xs font-semibold tabular-nums">
              Used {formatDurationCompact(elapsedSeconds)}
              {estimateSeconds > 0 ? ` / Estimate ${formatDurationCompact(estimateSeconds)}` : " / No estimate"}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {!validation.ok ? <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200">Time conflict</Badge> : null}
          <Badge className={statusClass[task.status]}>{task.status}</Badge>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {task.status === "paused" ? (
          <Button type="button" size="sm" onClick={handleStart}>
            <RotateCcw className="h-4 w-4" />
            Resume
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={handleStart} disabled={task.status === "doing"}>
            <Play className="h-4 w-4" />
            Start
          </Button>
        )}
        <Button type="button" size="icon" variant="secondary" onClick={() => void completeTask(task.id, "Marked done from task list")}>
          <Check className="h-4 w-4" />
        </Button>
        <div ref={actionsRef} className="relative">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={() => setActionsOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            aria-label="More task actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {actionsOpen ? (
            <div
              role="menu"
              className="absolute left-0 top-10 z-20 w-48 rounded-md border bg-background p-1 text-sm shadow-lg"
            >
              <TaskActionItem icon={Pencil} label="Edit" onClick={() => runMenuAction(() => setEditing(true))} />
              <TaskActionItem
                icon={CalendarPlus}
                label="Move to tomorrow"
                onClick={() => runMenuAction(() => handleReschedule(1))}
              />
              <TaskActionItem
                icon={CalendarClock}
                label="Move to next week"
                onClick={() => runMenuAction(() => handleReschedule(7))}
              />
              {isTodayPlanTask ? (
                <TaskActionItem
                  icon={CalendarX}
                  label="Skip today"
                  onClick={() =>
                    runMenuAction(async () => {
                      if (await confirm({ title: "Skip today", message: "Skip this planned task for today?", confirmLabel: "Skip" })) {
                        await skipPlannedTask(task.id);
                      }
                    })
                  }
                />
              ) : null}
              <TaskActionItem icon={Inbox} label="Move to backlog" onClick={() => runMenuAction(handleMoveToBacklog)} />
              <div className="my-1 h-px bg-border" />
              <TaskActionItem
                icon={X}
                label="Drop"
                onClick={() =>
                  runMenuAction(async () => {
                    if (await confirm({ title: "Drop task", message: "Drop this task?", confirmLabel: "Drop", danger: true })) {
                      await dropTask(task.id);
                    }
                  })
                }
              />
              <TaskActionItem icon={Trash2} label="Delete" danger onClick={() => runMenuAction(handleDelete)} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TaskActionItem({
  icon: Icon,
  label,
  danger = false,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition ${
        danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
