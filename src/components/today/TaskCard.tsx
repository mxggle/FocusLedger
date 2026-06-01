import { CalendarX, Check, Pencil, Play, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { validateTaskSchedule } from "../../services/scheduleConflictService";
import { useTaskStore } from "../../stores/taskStore";
import { getLiveTaskSeconds, useTimerStore } from "../../stores/timerStore";
import type { Task, TaskPriority } from "../../types";
import { toDateKey } from "../../utils/date";
import { formatDurationCompact } from "../../utils/duration";
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
  const skipPlannedTask = useTaskStore((state) => state.skipPlannedTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const now = useTimerStore((state) => state.now);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [estimate, setEstimate] = useState(task.estimated_minutes?.toString() ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [plannedStart, setPlannedStart] = useState(task.planned_start_time ?? "");
  const [plannedEnd, setPlannedEnd] = useState(task.planned_end_time ?? "");
  const category = categories.find((item) => item.id === task.category_id);
  const elapsedSeconds = getLiveTaskSeconds(task.id, activeEntry, closedTaskDurations, now);
  const estimateSeconds = (task.estimated_minutes ?? 0) * 60;
  const parsedEstimate = parseEstimate(estimate);
  const minimumEstimate = minimumEstimateMinutes(elapsedSeconds);
  const estimateTooSmall = parsedEstimate !== null && parsedEstimate < minimumEstimate;
  const isTodayPlanTask = Boolean(task.template_id && task.due_date === toDateKey());
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

  async function handleStart() {
    const result = await startTask(task.id);
    if (result === "active-exists") {
      const confirmed = window.confirm(
        "You already have an active task.\nDo you want to pause the current task and start this one?"
      );
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
    const confirmed = window.confirm(
      elapsedSeconds > 0
        ? "Remove this task from today? Its time records will be kept."
        : "Delete this task?"
    );
    if (confirmed) {
      await deleteTask(task.id);
    }
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
        <Button type="button" size="icon" variant="secondary" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={() => {
            if (window.confirm("Drop this task?")) {
              void dropTask(task.id);
            }
          }}
        >
          <X className="h-4 w-4" />
        </Button>
        {isTodayPlanTask ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm("Skip this planned task for today?")) {
                void skipPlannedTask(task.id);
              }
            }}
          >
            <CalendarX className="h-4 w-4" />
            Skip today
          </Button>
        ) : null}
        <Button type="button" size="icon" variant="ghost" onClick={() => void handleDelete()}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
