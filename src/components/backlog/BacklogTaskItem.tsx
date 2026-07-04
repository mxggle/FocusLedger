import { addDays } from "date-fns";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Hourglass,
  Inbox,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
  X
} from "lucide-react";
import { useState } from "react";
import { useTaskHighlight } from "../../hooks/useTaskHighlight";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { Task, TaskPriority } from "../../types";
import {
  BACKLOG_AGING_DAYS,
  BACKLOG_STALE_DAYS,
  backlogAgeDays,
  type BacklogViewMode
} from "../../utils/backlogView";
import { resolveCategoryColor } from "../../utils/category";
import { cn } from "../../utils/cn";
import { formatDateLabel, toDateKey } from "../../utils/date";
import { formatDurationCompact, parseEstimateMinutes } from "../../utils/duration";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { Field, Input, Select } from "../ui/Field";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuItem, MenuSeparator } from "../ui/Menu";

const priorityBadge: Record<TaskPriority, "neutral" | "primary" | "warning"> = {
  low: "neutral",
  medium: "primary",
  high: "warning"
};

/** Shared schedule/edit/delete handlers for a backlog task. */
function useBacklogTaskActions(task: Task) {
  const updateTask = useTaskStore((state) => state.updateTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const startTask = useTaskStore((state) => state.startTask);
  const confirm = useUiStore((state) => state.confirm);

  return {
    moveToToday: () => updateTask(task.id, { due_date: toDateKey() }),
    moveToTomorrow: () =>
      updateTask(task.id, { due_date: toDateKey(addDays(new Date(), 1)) }),
    moveToNextWeek: () =>
      updateTask(task.id, { due_date: toDateKey(addDays(new Date(), 7)) }),
    moveToBacklog: () => updateTask(task.id, { due_date: null }),
    startToday: async () => {
      const result = await updateTask(task.id, { due_date: toDateKey() });
      if (!result.ok) return;
      // Starting a task auto-pauses whatever is currently running.
      await startTask(task.id);
    },
    remove: async () => {
      if (
        await confirm({
          title: "Delete task",
          message: "Permanently delete this backlog task?",
          confirmLabel: "Delete",
          danger: true
        })
      ) {
        await deleteTask(task.id);
      }
    }
  };
}

export function BacklogTaskItem({
  task,
  view
}: {
  task: Task;
  view: BacklogViewMode;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <BacklogTaskEditor
        task={task}
        framed={view === "cards"}
        onClose={() => setEditing(false)}
      />
    );
  }

  return view === "cards" ? (
    <BacklogTaskCard task={task} onEdit={() => setEditing(true)} />
  ) : (
    <BacklogTaskRow task={task} onEdit={() => setEditing(true)} />
  );
}

function AgeHint({ task }: { task: Task }) {
  const age = backlogAgeDays(task);
  if (task.due_date || age < BACKLOG_AGING_DAYS) return null;
  const stale = age >= BACKLOG_STALE_DAYS;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        stale ? "font-medium text-warning" : "text-subtle"
      )}
      title={`In backlog for ${age} days`}
    >
      <Hourglass className="h-3 w-3" />
      {age}d
    </span>
  );
}

function TaskMeta({ task }: { task: Task }) {
  const categories = useTaskStore((state) => state.categories);
  const category = categories.find((item) => item.id === task.category_id);

  return (
    <>
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
      <AgeHint task={task} />
    </>
  );
}

function ScheduleMenuItems({
  task,
  onEdit
}: {
  task: Task;
  onEdit: () => void;
}) {
  const actions = useBacklogTaskActions(task);

  return (
    <>
      <MenuItem icon={CalendarCheck} onSelect={() => void actions.moveToToday()}>
        Move to today
      </MenuItem>
      {!task.due_date ? (
        <>
          <MenuItem
            icon={CalendarPlus}
            onSelect={() => void actions.moveToTomorrow()}
          >
            Tomorrow
          </MenuItem>
          <MenuItem
            icon={CalendarClock}
            onSelect={() => void actions.moveToNextWeek()}
          >
            Next week
          </MenuItem>
        </>
      ) : (
        <MenuItem icon={Inbox} onSelect={() => void actions.moveToBacklog()}>
          Move to backlog
        </MenuItem>
      )}
      <MenuItem icon={Play} onSelect={() => void actions.startToday()}>
        Start now
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={Pencil} onSelect={onEdit}>
        Edit
      </MenuItem>
      <MenuItem icon={Trash2} danger onSelect={() => void actions.remove()}>
        Delete
      </MenuItem>
    </>
  );
}

/** Comfortable card presentation with inline quick actions. */
function BacklogTaskCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const categories = useTaskStore((state) => state.categories);
  const actions = useBacklogTaskActions(task);
  const category = categories.find((item) => item.id === task.category_id);
  const categoryColor = resolveCategoryColor(category?.color);
  const { ref: highlightRef, highlighted } = useTaskHighlight<HTMLDivElement>(task.id);

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
            <TaskMeta task={task} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Soft emphasis only — the page-level Quick add is the lone gradient
              moment; repeating it on every card turns the list into noise. */}
          <Button
            type="button"
            size="sm"
            variant="soft"
            onClick={() => void actions.moveToToday()}
          >
            <CalendarCheck className="h-3.5 w-3.5" />
            Today
          </Button>
          {!task.due_date ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void actions.moveToTomorrow()}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Tomorrow
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void actions.moveToNextWeek()}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Next week
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void actions.startToday()}
          >
            <Play className="h-3.5 w-3.5" />
            Start
          </Button>
          {/* Destructive/rare actions stay out of the way until the card is
              hovered or focused, matching the list view's reveal pattern. */}
          <div className="flex items-center gap-1 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover:opacity-100">
            {task.due_date ? (
              <IconButton
                icon={Inbox}
                label="Move to backlog"
                variant="secondary"
                onClick={() => void actions.moveToBacklog()}
              />
            ) : null}
            <IconButton
              icon={Pencil}
              label="Edit backlog task"
              variant="secondary"
              onClick={onEdit}
            />
            <IconButton
              icon={Trash2}
              label="Delete backlog task"
              onClick={() => void actions.remove()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Dense single-line row for the list view; secondary actions live in a menu. */
function BacklogTaskRow({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const categories = useTaskStore((state) => state.categories);
  const actions = useBacklogTaskActions(task);
  const category = categories.find((item) => item.id === task.category_id);
  const { ref: highlightRef, highlighted } = useTaskHighlight<HTMLDivElement>(task.id);

  return (
    <div
      ref={highlightRef}
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-muted/50",
        highlighted && "bg-primary-soft/60"
      )}
    >
      <CategoryDot color={category?.color} />
      <span
        className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
        title={task.title}
      >
        {task.title}
      </span>

      <div className="flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground">
        <AgeHint task={task} />
        {task.estimated_minutes ? (
          <span className="tabular-nums">
            {formatDurationCompact(task.estimated_minutes * 60)}
          </span>
        ) : null}
        {task.due_date ? (
          <span className="inline-flex items-center gap-1 font-medium text-foreground/70">
            <CalendarDays className="h-3 w-3" />
            {formatDateLabel(task.due_date)}
          </span>
        ) : null}
        <Badge variant={priorityBadge[task.priority]} dot>
          {task.priority}
        </Badge>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover:opacity-100">
        <Button type="button" size="sm" variant="soft" onClick={() => void actions.moveToToday()}>
          <CalendarCheck className="h-3.5 w-3.5" />
          Today
        </Button>
        <Menu
          align="end"
          trigger={<IconButton icon={MoreHorizontal} label="Task actions" />}
        >
          <ScheduleMenuItems task={task} onEdit={onEdit} />
        </Menu>
      </div>
    </div>
  );
}

/** Inline editor shared by both views; framed adds its own card chrome. */
function BacklogTaskEditor({
  task,
  framed,
  onClose
}: {
  task: Task;
  framed: boolean;
  onClose: () => void;
}) {
  const categories = useTaskStore((state) => state.categories);
  const updateTask = useTaskStore((state) => state.updateTask);

  const [title, setTitle] = useState(task.title);
  const [categoryId, setCategoryId] = useState(task.category_id ?? "inbox");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [estimate, setEstimate] = useState(task.estimated_minutes?.toString() ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");

  async function save() {
    const result = await updateTask(task.id, {
      title,
      category_id: categoryId || "inbox",
      priority,
      estimated_minutes: parseEstimateMinutes(estimate),
      due_date: dueDate || null
    });
    if (result.ok) onClose();
  }

  return (
    <div
      className={cn(
        "p-4",
        framed && "rounded-xl border border-border bg-surface shadow-card"
      )}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_160px_120px_120px_150px]">
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
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
        <Field label="Due date" hint="Empty keeps it in the backlog">
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={!title.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}
