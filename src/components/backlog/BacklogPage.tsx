import { addDays } from "date-fns";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Inbox,
  Package,
  Pencil,
  Play,
  Plus,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShortcutLabel } from "../../hooks/useShortcutLabel";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { Task, TaskPriority } from "../../types";
import { formatDateLabel, toDateKey } from "../../utils/date";
import { cn } from "../../utils/cn";
import { useTaskHighlight } from "../../hooks/useTaskHighlight";
import { formatDurationCompact } from "../../utils/duration";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input, Select } from "../ui/Field";
import { IconButton } from "../ui/IconButton";
import { PageHeader } from "../ui/PageHeader";
import { resolveCategoryColor } from "../../utils/category";

function parseEstimate(value: string): number | null {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const priorityBadge: Record<TaskPriority, "neutral" | "primary" | "warning"> = {
  low: "neutral",
  medium: "primary",
  high: "warning"
};

export function BacklogPage() {
  const backlogTasks = useTaskStore((state) => state.backlogTasks);
  const allTasks = useTaskStore((state) => state.allTasks);
  const openQuickAdd = useUiStore((state) => state.openQuickAdd);
  const shortcutLabel = useShortcutLabel();
  const todayDate = toDateKey();

  const scheduledTasks = useMemo(
    () =>
      allTasks
        .filter(
          (task) =>
            task.due_date &&
            task.due_date > todayDate &&
            task.status !== "done" &&
            task.status !== "dropped"
        )
        .sort((a, b) => {
          const dateCompare = (a.due_date ?? "").localeCompare(b.due_date ?? "");
          if (dateCompare !== 0) return dateCompare;
          return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
        }),
    [allTasks, todayDate]
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-7">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          icon={Package}
          eyebrow="Backlog"
          title="Captured & scheduled work"
          actions={
            <Button type="button" onClick={openQuickAdd}>
              <Plus className="h-4 w-4" />
              Quick add
            </Button>
          }
        />

        <div className="grid gap-7">
        {/* Scheduled section */}
        <section>
          <SectionHeader title="Scheduled" count={scheduledTasks.length} />
          <div className="mt-3 grid gap-3">
            {scheduledTasks.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="No future scheduled tasks."
                hint="Use Quick add or move a backlog task to a date."
                dashed
              />
            ) : (
              scheduledTasks.map((task) => (
                <BacklogTaskCard key={task.id} task={task} />
              ))
            )}
          </div>
        </section>

        {/* Backlog section */}
        <section>
          <SectionHeader title="Backlog" count={backlogTasks.length} />
          <div className="mt-3 grid gap-3">
            {backlogTasks.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Backlog is clear."
                hint={`Use Quick add (${shortcutLabel}) to capture ideas.`}
                dashed
              />
            ) : (
              backlogTasks.map((task) => (
                <BacklogTaskCard key={task.id} task={task} />
              ))
            )}
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-0.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function BacklogTaskCard({ task }: { task: Task }) {
  const categories = useTaskStore((state) => state.categories);
  const updateTask = useTaskStore((state) => state.updateTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const startTask = useTaskStore((state) => state.startTask);
  const confirm = useUiStore((state) => state.confirm);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [categoryId, setCategoryId] = useState(task.category_id ?? "inbox");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [estimate, setEstimate] = useState(task.estimated_minutes?.toString() ?? "");
  const [scheduleDate, setScheduleDate] = useState(task.due_date ?? toDateKey());

  const category = categories.find((item) => item.id === task.category_id);
  const categoryColor = resolveCategoryColor(category?.color);
  const { ref: highlightRef, highlighted } = useTaskHighlight<HTMLDivElement>(task.id);

  useEffect(() => {
    setTitle(task.title);
    setCategoryId(task.category_id ?? "inbox");
    setPriority(task.priority);
    setEstimate(task.estimated_minutes?.toString() ?? "");
    setScheduleDate(task.due_date ?? toDateKey());
  }, [
    task.category_id,
    task.due_date,
    task.estimated_minutes,
    task.id,
    task.priority,
    task.title
  ]);

  async function moveToToday() {
    await updateTask(task.id, { due_date: toDateKey() });
  }

  async function moveToTomorrow() {
    await updateTask(task.id, {
      due_date: toDateKey(addDays(new Date(), 1))
    });
  }

  async function moveToNextWeek() {
    await updateTask(task.id, {
      due_date: toDateKey(addDays(new Date(), 7))
    });
  }

  async function moveToBacklog() {
    await updateTask(task.id, { due_date: null });
  }

  async function startToday() {
    const updateResult = await updateTask(task.id, { due_date: toDateKey() });
    if (!updateResult.ok) return;
    // Starting a task auto-pauses whatever is currently running.
    await startTask(task.id);
  }

  async function saveEdit() {
    const result = await updateTask(task.id, {
      title,
      category_id: categoryId || "inbox",
      priority,
      estimated_minutes: parseEstimate(estimate)
    });
    if (result.ok) setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_140px_140px]">
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
          <Field label="Estimate (min)">
            <Input
              type="number"
              min="1"
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button type="button" onClick={saveEdit} disabled={!title.trim()}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={highlightRef}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-surface p-4 pl-5 shadow-card transition-[box-shadow,border-color,transform] duration-fast hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md",
        highlighted && "border-primary ring-2 ring-primary/60"
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: categoryColor }}
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {task.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            {task.due_date ? (
              <span className="inline-flex items-center gap-1 font-medium text-foreground/70">
                <CalendarDays className="h-3 w-3" />
                {formatDateLabel(task.due_date)}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <CategoryDot color={category?.color} />
              {category?.name ?? "Inbox"}
            </span>
            <Badge variant={priorityBadge[task.priority]} dot>
              {task.priority}
            </Badge>
            {task.estimated_minutes ? (
              <span className="tabular-nums">
                {formatDurationCompact(task.estimated_minutes * 60)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" onClick={moveToToday}>
            <CalendarCheck className="h-3.5 w-3.5" />
            Today
          </Button>
          {!task.due_date ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={moveToTomorrow}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Tomorrow
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={moveToNextWeek}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Next week
              </Button>
            </>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={startToday}>
            <Play className="h-3.5 w-3.5" />
            Start
          </Button>
          {task.due_date ? (
            <IconButton
              icon={Inbox}
              label="Move to backlog"
              variant="secondary"
              onClick={moveToBacklog}
            />
          ) : null}
          <IconButton
            icon={Pencil}
            label="Edit backlog task"
            variant="secondary"
            onClick={() => setEditing(true)}
          />
          <IconButton
            icon={Trash2}
            label="Delete backlog task"
            onClick={() => {
              void (async () => {
                if (
                  await confirm({
                    title: "Delete task",
                    message: "Delete this backlog task?",
                    confirmLabel: "Delete",
                    danger: true
                  })
                ) {
                  await deleteTask(task.id);
                }
              })();
            }}
          />
        </div>
      </div>

      {task.due_date ? (
        <div className="mt-3.5 border-t border-border pt-3.5">
          <label className="inline-grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Scheduled date
            </span>
            <div className="relative">
              <CalendarDays
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
                aria-hidden="true"
              />
              <input
                type="date"
                value={scheduleDate}
                onChange={async (event) => {
                  const newDate = event.target.value;
                  if (!newDate) return;
                  setScheduleDate(newDate);
                  await updateTask(task.id, { due_date: newDate });
                }}
                className="h-9 cursor-pointer rounded-md border border-input bg-surface pl-8 pr-3 text-sm text-foreground shadow-xs outline-none transition-[box-shadow,border-color] duration-fast hover:border-border-strong focus:border-ring focus:shadow-ring"
              />
            </div>
          </label>
        </div>
      ) : null}
    </div>
  );
}
