import { CalendarCheck, Hourglass, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTaskHighlight } from "../../hooks/useTaskHighlight";
import { useTaskStore } from "../../stores/taskStore";
import type { Task } from "../../types";
import {
  BACKLOG_AGING_DAYS,
  BACKLOG_STALE_DAYS,
  backlogAgeDays
} from "../../utils/backlogView";
import { cn } from "../../utils/cn";
import { formatDateLabel } from "../../utils/date";
import { formatDurationCompact } from "../../utils/duration";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { IconButton } from "../ui/IconButton";
import { Menu } from "../ui/Menu";
import {
  BacklogTaskEditor,
  priorityBadge,
  ScheduleMenuItems,
  useBacklogTaskActions
} from "./BacklogTaskItem";

const headerCell =
  "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

/** Dense data table for one backlog group; every column at a glance. */
export function BacklogTaskTable({ tasks }: { tasks: Task[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={cn(headerCell, "pl-4")}>Task</th>
            <th className={headerCell}>Category</th>
            <th className={headerCell}>Due</th>
            <th className={headerCell}>Estimate</th>
            <th className={headerCell}>Age</th>
            <th className={headerCell}>Priority</th>
            <th className={headerCell} aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tasks.map((task) => (
            <BacklogTableRow key={task.id} task={task} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgeCell({ task }: { task: Task }) {
  if (task.due_date) return <span className="text-subtle">—</span>;
  const age = backlogAgeDays(task);
  const stale = age >= BACKLOG_STALE_DAYS;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        stale
          ? "font-medium text-warning"
          : age >= BACKLOG_AGING_DAYS
            ? "text-subtle"
            : "text-muted-foreground"
      )}
      title={`In backlog for ${age} days`}
    >
      {age >= BACKLOG_AGING_DAYS ? <Hourglass className="h-3 w-3" /> : null}
      {age}d
    </span>
  );
}

function BacklogTableRow({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);
  const categories = useTaskStore((state) => state.categories);
  const actions = useBacklogTaskActions(task);
  const category = categories.find((item) => item.id === task.category_id);
  const { ref: highlightRef, highlighted } =
    useTaskHighlight<HTMLTableRowElement>(task.id);

  if (editing) {
    return (
      <tr>
        <td colSpan={7} className="p-0">
          <BacklogTaskEditor
            task={task}
            framed={false}
            onClose={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr
      ref={highlightRef}
      className={cn(
        "group transition-colors duration-fast hover:bg-muted/50",
        highlighted && "bg-primary-soft/60"
      )}
    >
      <td className="max-w-[320px] py-2.5 pl-4 pr-3">
        <span className="flex items-center gap-2.5">
          <CategoryDot color={category?.color} />
          <span
            className="truncate font-medium text-foreground"
            title={task.title}
          >
            {task.title}
          </span>
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
        {category?.name ?? "Inbox"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
        {task.due_date ? (
          <span className="font-medium text-foreground/70">
            {formatDateLabel(task.due_date)}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
        {task.estimated_minutes
          ? formatDurationCompact(task.estimated_minutes * 60)
          : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
        <AgeCell task={task} />
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <Badge variant={priorityBadge[task.priority]} dot>
          {task.priority}
        </Badge>
      </td>
      <td className="whitespace-nowrap py-1.5 pl-3 pr-2">
        <span className="flex items-center justify-end gap-1 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover:opacity-100">
          <Button
            type="button"
            size="sm"
            variant="soft"
            onClick={() => void actions.moveToToday()}
          >
            <CalendarCheck className="h-3.5 w-3.5" />
            Today
          </Button>
          <Menu
            align="end"
            trigger={<IconButton icon={MoreHorizontal} label="Task actions" />}
          >
            <ScheduleMenuItems task={task} onEdit={() => setEditing(true)} />
          </Menu>
        </span>
      </td>
    </tr>
  );
}
