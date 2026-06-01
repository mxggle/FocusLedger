import { CalendarCheck, CalendarPlus, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { Task, TaskPriority } from "../../types";
import { toDateKey } from "../../utils/date";
import { formatDurationCompact } from "../../utils/duration";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Field, Input, Select } from "../ui/Field";

function parseEstimate(value: string): number | null {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function BacklogPage() {
  const backlogTasks = useTaskStore((state) => state.backlogTasks);
  const openQuickAdd = useUiStore((state) => state.openQuickAdd);

  return (
    <div className="h-screen overflow-y-auto p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-muted-foreground">Backlog</div>
          <h2 className="mt-1 text-2xl font-semibold">Captured work</h2>
        </div>
        <Button type="button" onClick={openQuickAdd}>
          <Plus className="h-4 w-4" />
          Quick add
        </Button>
      </div>

      <div className="grid gap-3">
        {backlogTasks.length === 0 ? (
          <div className="rounded-md border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
            No backlog tasks.
          </div>
        ) : (
          backlogTasks.map((task) => <BacklogTaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}

function BacklogTaskCard({ task }: { task: Task }) {
  const categories = useTaskStore((state) => state.categories);
  const updateTask = useTaskStore((state) => state.updateTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const startTask = useTaskStore((state) => state.startTask);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [categoryId, setCategoryId] = useState(task.category_id ?? "inbox");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [estimate, setEstimate] = useState(task.estimated_minutes?.toString() ?? "");
  const [scheduleDate, setScheduleDate] = useState(toDateKey());
  const category = categories.find((item) => item.id === task.category_id);

  useEffect(() => {
    setTitle(task.title);
    setCategoryId(task.category_id ?? "inbox");
    setPriority(task.priority);
    setEstimate(task.estimated_minutes?.toString() ?? "");
  }, [task.category_id, task.estimated_minutes, task.id, task.priority, task.title]);

  async function moveToToday() {
    await updateTask(task.id, { due_date: toDateKey() });
  }

  async function scheduleTask() {
    if (!scheduleDate) {
      return;
    }
    await updateTask(task.id, { due_date: scheduleDate });
  }

  async function startToday() {
    const updateResult = await updateTask(task.id, { due_date: toDateKey() });
    if (!updateResult.ok) {
      return;
    }

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
      category_id: categoryId || "inbox",
      priority,
      estimated_minutes: parseEstimate(estimate)
    });
    if (result.ok) {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-md border bg-background p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_140px_140px]">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Field label="Estimate">
            <Input type="number" min="1" value={estimate} onChange={(event) => setEstimate(event.target.value)} />
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
    <div className="rounded-md border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{task.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{category?.name ?? "Inbox"}</span>
            <Badge>{task.priority}</Badge>
            {task.estimated_minutes ? <span>{formatDurationCompact(task.estimated_minutes * 60)} estimate</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" onClick={moveToToday}>
            <CalendarCheck className="h-4 w-4" />
            Today
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={startToday}>
            <Play className="h-4 w-4" />
            Start
          </Button>
          <Button type="button" size="icon" variant="secondary" onClick={() => setEditing(true)} aria-label="Edit backlog task">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => {
              if (window.confirm("Delete this backlog task?")) {
                void deleteTask(task.id);
              }
            }}
            aria-label="Delete backlog task"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Schedule">
          <Input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
        </Field>
        <Button type="button" size="sm" variant="secondary" onClick={scheduleTask} disabled={!scheduleDate}>
          <CalendarPlus className="h-4 w-4" />
          Schedule
        </Button>
      </div>
    </div>
  );
}
