import { Check, Pencil, Play, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { getLiveTaskSeconds, useTimerStore } from "../../stores/timerStore";
import type { Task, TaskPriority } from "../../types";
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

export function TaskCard({ task }: { task: Task }) {
  const categories = useTaskStore((state) => state.categories);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const startTask = useTaskStore((state) => state.startTask);
  const completeTask = useTaskStore((state) => state.completeTask);
  const dropTask = useTaskStore((state) => state.dropTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const now = useTimerStore((state) => state.now);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [estimate, setEstimate] = useState(task.estimated_minutes?.toString() ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const category = categories.find((item) => item.id === task.category_id);
  const elapsedSeconds = getLiveTaskSeconds(task.id, activeEntry, closedTaskDurations, now);
  const plannedTime = task.planned_end_time
    ? `${task.planned_start_time}-${task.planned_end_time}`
    : task.planned_start_time;

  async function handleStart() {
    const result = await startTask(task.id);
    if (result === "active-exists") {
      const confirmed = window.confirm(
        "You already have an active task.\nDo you want to stop the current task and start this one?"
      );
      if (confirmed) {
        await startTask(task.id, { stopCurrent: true });
      }
    }
  }

  async function saveEdit() {
    await updateTask(task.id, {
      title,
      estimated_minutes: estimate ? Number(estimate) : null,
      priority
    });
    setEditing(false);
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
              <Input type="number" min="1" value={estimate} onChange={(event) => setEstimate(event.target.value)} />
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit} disabled={!title.trim()}>
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
        </div>
        <Badge className={statusClass[task.status]}>{task.status}</Badge>
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
        <Button type="button" size="icon" variant="secondary" onClick={() => void dropTask(task.id)}>
          <X className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" onClick={() => void deleteTask(task.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
