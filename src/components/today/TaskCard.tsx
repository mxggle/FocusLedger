import { addDays } from "date-fns";
import {
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Check,
  Clock,
  Inbox,
  MoreHorizontal,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { validateTaskSchedule } from "../../services/scheduleConflictService";
import { useTaskStore } from "../../stores/taskStore";
import { getLiveTaskSeconds, useTimerStore } from "../../stores/timerStore";
import { useUiStore } from "../../stores/uiStore";
import type { Task, TaskPriority } from "../../types";
import { formatDateLabel, toDateKey } from "../../utils/date";
import { formatDurationCompact } from "../../utils/duration";
import { isTaskOverdue } from "../../utils/taskGrouping";
import { useTaskHighlight } from "../../hooks/useTaskHighlight";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { Field, Input, Select } from "../ui/Field";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuItem, MenuSeparator } from "../ui/Menu";
import { cn } from "../../utils/cn";
import { resolveCategoryColor } from "../../utils/category";
import { StopSessionDialog } from "./StopSessionDialog";

// ── Status badge mapping ──────────────────────────────────────────────────────

type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger";

const statusVariant: Record<Task["status"], BadgeVariant> = {
  todo: "neutral",
  doing: "primary",
  paused: "warning",
  done: "success",
  dropped: "danger"
};

const statusLabel: Record<Task["status"], string> = {
  todo: "To do",
  doing: "In progress",
  paused: "Paused",
  done: "Done",
  dropped: "Dropped"
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── TaskCard ──────────────────────────────────────────────────────────────────

export function TaskCard({ task }: { task: Task }) {
  const categories = useTaskStore((state) => state.categories);
  const tasks = useTaskStore((state) => state.allTasks);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const startTask = useTaskStore((state) => state.startTask);
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
  const [categoryId, setCategoryId] = useState(task.category_id ?? "inbox");
  const [plannedStart, setPlannedStart] = useState(task.planned_start_time ?? "");
  const [plannedEnd, setPlannedEnd] = useState(task.planned_end_time ?? "");
  const [stopOpen, setStopOpen] = useState(false);
  const { ref: highlightRef, highlighted } = useTaskHighlight<HTMLDivElement>(task.id);

  const category = categories.find((item) => item.id === task.category_id);
  const categoryColor = resolveCategoryColor(category?.color);
  const elapsedSeconds = getLiveTaskSeconds(task.id, activeEntry, closedTaskDurations, now);
  const estimateSeconds = (task.estimated_minutes ?? 0) * 60;
  const parsedEstimate = parseEstimate(estimate);
  const minimumEstimate = minimumEstimateMinutes(elapsedSeconds);
  const estimateTooSmall = parsedEstimate !== null && parsedEstimate < minimumEstimate;
  const isTodayPlanTask = Boolean(task.template_id && task.due_date === toDateKey());
  const overdue = isTaskOverdue(task, toDateKey());
  const plannedTime = task.planned_end_time
    ? `${task.planned_start_time}–${task.planned_end_time}`
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
    setCategoryId(task.category_id ?? "inbox");
    setPlannedStart(task.planned_start_time ?? "");
    setPlannedEnd(task.planned_end_time ?? "");
  }, [
    task.id,
    task.title,
    task.estimated_minutes,
    task.priority,
    task.category_id,
    task.planned_start_time,
    task.planned_end_time
  ]);

  // ── Handlers (logic unchanged) ────────────────────────────────────────────

  async function handleStart() {
    // Starting a task auto-pauses whatever is currently running.
    await startTask(task.id);
  }

  function handleDone() {
    setStopOpen(true);
  }

  async function saveEdit() {
    const result = await updateTask(task.id, {
      title,
      estimated_minutes: parseEstimate(estimate),
      priority,
      category_id: categoryId || "inbox",
      ...(isTodayPlanTask
        ? {
            planned_start_time: plannedStart,
            planned_end_time: plannedEnd || null,
            sort_order: timeToSortOrder(plannedStart)
          }
        : {})
    });
    if (!result.ok) return;
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
    if (confirmed) await deleteTask(task.id);
  }

  async function handleMoveToBacklog() {
    const message =
      task.status === "doing"
        ? "Move this active task to backlog? The current timer will stop."
        : "Move this task back to backlog?";
    if (
      await confirm({ title: "Move to backlog", message, confirmLabel: "Move" })
    ) {
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
    if (
      await confirm({
        title: `Move to ${label}`,
        message,
        confirmLabel: "Move"
      })
    ) {
      await rescheduleTask(task.id, targetDate);
    }
  }

  // ── Edit view ─────────────────────────────────────────────────────────────

  if (editing) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-3">
          <Field label="Title">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Category">
            <Select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimate (min)">
              <Input
                type="number"
                min={minimumEstimate}
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
              />
            </Field>
            <Field label="Priority">
              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </Field>
          </div>
          {isTodayPlanTask ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Today start">
                <Input
                  type="time"
                  value={plannedStart}
                  onChange={(event) => setPlannedStart(event.target.value)}
                />
              </Field>
              <Field label="Today end">
                <Input
                  type="time"
                  value={plannedEnd}
                  onChange={(event) => setPlannedEnd(event.target.value)}
                />
              </Field>
            </div>
          ) : null}
          {!validation.ok ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground">
              {validation.message}
            </div>
          ) : null}
          {estimateTooSmall ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground">
              Estimate cannot be less than time already spent (
              {formatDurationCompact(elapsedSeconds)}).
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveEdit}
              disabled={
                !title.trim() ||
                estimateTooSmall ||
                (isTodayPlanTask && (!plannedStart || !validation.ok))
              }
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Default view ──────────────────────────────────────────────────────────

  const isActive = task.status === "doing";

  return (
    <>
      <div
        ref={highlightRef}
        className={cn(
          "group relative overflow-hidden rounded-xl border bg-surface p-3.5 pl-4 shadow-card",
          "transition-[box-shadow,border-color,transform] duration-fast hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md",
          isActive ? "border-primary/40 ring-1 ring-inset ring-primary/10" : "border-border",
          highlighted && "border-primary ring-2 ring-primary/60"
        )}
      >
      {/* Category accent rail */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: categoryColor }}
        aria-hidden="true"
      />

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {task.title}
          </h3>
          {/* Meta info row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            {overdue && task.due_date ? (
              <span className="inline-flex items-center gap-1 font-semibold text-warning-soft-foreground">
                <CalendarClock className="h-3 w-3" />
                Due {formatDateLabel(task.due_date)}
              </span>
            ) : null}
            {plannedTime ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="h-3 w-3" />
                {plannedTime}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <CategoryDot color={category?.color} />
              {category?.name ?? "Inbox"}
            </span>
            {task.priority !== "medium" ? (
              <span className="capitalize">{task.priority} priority</span>
            ) : null}
            {elapsedSeconds > 0 || estimateSeconds > 0 ? (
              <span className="font-medium tabular-nums text-foreground/70">
                {formatDurationCompact(elapsedSeconds)}
                {estimateSeconds > 0
                  ? ` / ${formatDurationCompact(estimateSeconds)}`
                  : ""}
              </span>
            ) : task.estimated_minutes ? (
              <span className="tabular-nums">{task.estimated_minutes} min</span>
            ) : null}
          </div>
        </div>

        {/* Status badges — right-aligned */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!validation.ok ? <Badge variant="danger" dot>Conflict</Badge> : null}
          <Badge variant={statusVariant[task.status]} dot>
            {statusLabel[task.status]}
          </Badge>
        </div>
      </div>

      {/* Action row. Text labels are kept whenever there's room: the action
          buttons wrap to a second line before their labels are dropped, so the
          menu is never clipped. Labels only collapse to icon-only below ~12rem
          of pane width, where even a wrapped layout would get too tall. */}
      <div className="mt-3.5 flex items-start gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {task.status === "paused" ? (
            <Button
              type="button"
              size="sm"
              onClick={handleStart}
              aria-label="Resume"
              title="Resume"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden @[12rem]:inline">Resume</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant={isActive ? "soft" : "primary"}
              onClick={handleStart}
              disabled={isActive}
              aria-label={isActive ? "Running" : "Start"}
              title={isActive ? "Running" : "Start"}
            >
              <Play className="h-3.5 w-3.5" />
              <span className="hidden @[12rem]:inline">
                {isActive ? "Running" : "Start"}
              </span>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleDone}
            aria-label="Done"
            title="Done"
          >
            <Check className="h-3.5 w-3.5" />
            <span className="hidden @[12rem]:inline">Done</span>
          </Button>
        </div>

        <div className="ml-auto shrink-0">
          <Menu
            align="end"
            trigger={
              <IconButton
                icon={MoreHorizontal}
                label="More task actions"
                variant="secondary"
              />
            }
          >
            <MenuItem icon={Pencil} onSelect={() => setEditing(true)}>
              Edit
            </MenuItem>
            <MenuItem
              icon={CalendarPlus}
              onSelect={() => void handleReschedule(1)}
            >
              Move to tomorrow
            </MenuItem>
            <MenuItem
              icon={CalendarClock}
              onSelect={() => void handleReschedule(7)}
            >
              Move to next week
            </MenuItem>
            {isTodayPlanTask ? (
              <MenuItem
                icon={CalendarX}
                onSelect={() =>
                  void (async () => {
                    if (
                      await confirm({
                        title: "Skip today",
                        message: "Skip this planned task for today?",
                        confirmLabel: "Skip"
                      })
                    ) {
                      await skipPlannedTask(task.id);
                    }
                  })()
                }
              >
                Skip today
              </MenuItem>
            ) : null}
            <MenuItem icon={Inbox} onSelect={() => void handleMoveToBacklog()}>
              Move to backlog
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={X}
              danger
              onSelect={() =>
                void (async () => {
                  if (
                    await confirm({
                      title: "Drop task",
                      message: "Drop this task?",
                      confirmLabel: "Drop",
                      danger: true
                    })
                  ) {
                    await dropTask(task.id);
                  }
                })()
              }
            >
              Drop
            </MenuItem>
            <MenuItem icon={Trash2} danger onSelect={() => void handleDelete()}>
              Delete
            </MenuItem>
          </Menu>
        </div>
      </div>
      </div>
      <StopSessionDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        taskId={task.id}
        getElapsedSeconds={() => elapsedSeconds}
      />
    </>
  );
}
