import { addDays } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
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
import { formatDurationCompact, parseEstimateMinutes } from "../../utils/duration";
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

function minimumEstimateMinutes(elapsedSeconds: number): number {
  return Math.max(1, Math.ceil(elapsedSeconds / 60));
}

/** Row actions are capsules an inch smaller than a standalone button: they sit
    inside a card, so they read as part of it rather than stacked on top. */
const ACTION_CLASS = "h-7 gap-1.5 rounded-full px-2.5 shadow-none";

/** The one accented control on a card: tinted at rest, filling solid on hover
    rather than shouting a saturated fill from every row of the list. */
const START_CLASS =
  "bg-primary-soft text-primary-soft-foreground hover:bg-primary hover:text-primary-foreground";

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
  const parsedEstimate = parseEstimateMinutes(estimate);
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
              estimated_minutes: parseEstimateMinutes(estimate)
            },
            tasks,
            task.id
          )
        : { ok: true as const },
    [estimate, isTodayPlanTask, plannedEnd, plannedStart, task, tasks]
  );

  // Seed the edit form from the task on demand (entering edit mode) rather
  // than on every task change: an external update (assistant, rollover) while
  // the user is typing must not clobber their in-progress edits.
  function seedEditForm() {
    setTitle(task.title);
    setEstimate(task.estimated_minutes?.toString() ?? "");
    setPriority(task.priority);
    setCategoryId(task.category_id ?? "inbox");
    setPlannedStart(task.planned_start_time ?? "");
    setPlannedEnd(task.planned_end_time ?? "");
  }

  function startEditing() {
    seedEditForm();
    setEditing(true);
  }

  // Defensive: if this mounted card is ever re-pointed at a different task,
  // abandon any stale edit state.
  useEffect(() => {
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

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
      estimated_minutes: parseEstimateMinutes(estimate),
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
          ? "Permanently delete this task? Its recorded time will be kept in your history."
          : "Permanently delete this task?",
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
      <div className="rounded-lg border border-border bg-surface p-4 shadow-card motion-safe:animate-fade-in">
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
  const isPaused = task.status === "paused";
  // "To do" is the default state of every card in the list — badging it says
  // nothing and turns the list into a wall of grey pills. Only a state that
  // differs from the default earns a badge.
  const showStatusBadge = task.status !== "todo";
  const overBudget = estimateSeconds > 0 && elapsedSeconds > estimateSeconds;
  const progress =
    estimateSeconds > 0 && elapsedSeconds > 0
      ? Math.min(100, (elapsedSeconds / estimateSeconds) * 100)
      : 0;

  return (
    <>
      <div
        ref={highlightRef}
        className={cn(
          "group/card relative overflow-hidden rounded-lg border py-3 pl-4 pr-3",
          // Hover changes tone only — the card never moves or scales.
          "transition-[background-color,border-color,box-shadow] duration-fast",
          "hover:border-border-strong hover:shadow-md",
          isActive
            ? "border-primary/30 bg-primary-soft/30 shadow-card dark:bg-primary-soft/25"
            : "border-border bg-surface shadow-xs",
          highlighted && "border-primary ring-2 ring-primary/50"
        )}
      >
        {/* Category spine — a hairline the height of the content, not a slab
            welded to the card's edge. */}
        <span
          className="pointer-events-none absolute inset-y-3 left-1.5 w-[3px] rounded-full"
          style={{ backgroundColor: categoryColor }}
          aria-hidden="true"
        />

        {/* Progress meter — elapsed vs. estimate as a hairline resting in the
            card's bottom padding, so effort is visible without opening the task. */}
        {progress > 0 ? (
          <span
            className="pointer-events-none absolute bottom-1.5 left-4 right-3 h-[2px] overflow-hidden rounded-full bg-border/70"
            aria-hidden="true"
          >
            <span
              className={cn(
                "block h-full rounded-full",
                overBudget ? "bg-warning" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </span>
        ) : null}

        {/* Header row. Wraps rather than overflows: on a narrow pane the status
            badges drop to their own line instead of being squeezed against a
            non-shrinking title and clipped by the card's overflow-hidden. */}
        <div className="flex flex-wrap items-start justify-between gap-x-2.5 gap-y-1.5">
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                "truncate text-sm font-semibold tracking-[-0.006em] text-foreground",
                task.status === "done" && "text-muted-foreground line-through"
              )}
            >
              {task.title}
            </h3>

            {/* Meta line — one quiet row of facts, weight reserved for the
                two that change a decision: an overdue date and time spent. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {overdue && task.due_date ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-px font-medium text-warning-soft-foreground ring-1 ring-inset ring-warning/15">
                  <CalendarClock className="h-3 w-3" />
                  {formatDateLabel(task.due_date)}
                </span>
              ) : null}
              {plannedTime ? (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="h-3 w-3" />
                  {plannedTime}
                </span>
              ) : null}
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <CategoryDot color={category?.color} />
                <span className="truncate">{category?.name ?? "Inbox"}</span>
              </span>
              {task.priority !== "medium" ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 capitalize",
                    task.priority === "high" &&
                      "font-medium text-destructive-soft-foreground"
                  )}
                >
                  {task.priority === "high" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {task.priority}
                </span>
              ) : null}
              {elapsedSeconds > 0 || estimateSeconds > 0 ? (
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    overBudget ? "text-warning-soft-foreground" : "text-foreground/75"
                  )}
                >
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

          {/* Status badges — right-aligned, even when wrapped alone onto their
              own line by ml-auto pushing them to the row's end. */}
          {!validation.ok || showStatusBadge ? (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {!validation.ok ? <Badge variant="danger" dot>Conflict</Badge> : null}
              {showStatusBadge ? (
                <Badge variant={statusVariant[task.status]} dot>
                  {statusLabel[task.status]}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Action row. One accented control per card: the tinted capsule fills
            solid on hover rather than shouting from rest. Text labels are kept
            whenever there's room — the buttons wrap to a second line before
            their labels are dropped, so the menu is never clipped. Labels only
            collapse to icon-only below ~12rem of pane width, where even a
            wrapped layout would get too tall. */}
        <div className="mt-2.5 flex items-start gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {isPaused ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(ACTION_CLASS, START_CLASS)}
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
                variant="ghost"
                className={cn(
                  ACTION_CLASS,
                  isActive
                    ? "disabled:bg-primary disabled:text-primary-foreground"
                    : START_CLASS
                )}
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
              variant="ghost"
              className={cn(
                ACTION_CLASS,
                "hover:bg-success-soft hover:text-success-soft-foreground"
              )}
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
                  size="sm"
                  className="rounded-full text-muted-foreground/60 data-[state=open]:bg-muted data-[state=open]:text-foreground"
                />
              }
            >
              <MenuItem icon={Pencil} onSelect={startEditing}>
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
                        message:
                          "Drop this task? It will be marked as abandoned and kept in your history.",
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
        hasSession={elapsedSeconds > 0 || task.status !== "todo"}
      />
    </>
  );
}
