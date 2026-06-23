import { AlertCircle, Check, Pencil, Play, CalendarClock, Inbox, RotateCcw, Search, Trash2, X } from "lucide-react";
import type { ComponentType } from "react";
import type { ToolCallRecord } from "../../services/ai/assistant/agentTools/types";
import { Button } from "../ui/Button";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  create_task: Check,
  update_task: Pencil,
  start_task: Play,
  pause_task: CalendarClock,
  complete_task: Check,
  move_to_backlog: Inbox,
  drop_task: Trash2,
  list_tasks: Search,
  get_task: Search,
  search_tasks: Search,
  list_categories: Search,
  get_calibration: Search,
  recall: Search,
  daily_summary: Search
};

type ToolCallCardProps = {
  call: ToolCallRecord;
  onApply: () => void;
  onDismiss: () => void;
  onRevert: () => void;
};

export function ToolCallCard({ call, onApply, onDismiss, onRevert }: ToolCallCardProps) {
  const Icon = ICONS[call.name] ?? Search;
  const pending = call.status === "pending";

  if (!pending) {
    return (
      <div
        className={
          "flex items-center gap-2.5 px-1 py-0.5 text-sm " +
          (call.status === "dismissed" || call.status === "reverted" ? "opacity-70" : "")
        }
      >
        <Icon
          className={
            "h-3.5 w-3.5 shrink-0 " +
            (call.status === "failed"
              ? "text-destructive"
              : call.destructive
                ? "text-destructive"
                : "text-primary")
          }
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-muted-foreground">{call.summary}</p>
          {call.status === "failed" && call.error ? (
            <p className="truncate text-xs text-destructive">{call.error}</p>
          ) : null}
        </div>
        {call.status === "executed" && call.undo ? (
          <Button size="sm" variant="ghost" onClick={onRevert} aria-label="Revert tool call">
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </Button>
        ) : null}
        <ToolStatusBadge status={call.status} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-sm shadow-xs">
      <div className="flex items-center gap-2.5">
        <Icon className={"h-4 w-4 shrink-0 " + (call.destructive ? "text-destructive" : "text-primary")} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-foreground">{call.summary}</p>
          <p className="truncate text-xs text-muted-foreground">{call.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss tool call">
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant={call.destructive ? "danger" : "primary"} onClick={onApply}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToolStatusBadge({ status }: { status: ToolCallRecord["status"] }) {
  if (status === "executed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success-soft-foreground">
        <Check className="h-3 w-3" /> Done
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive">
        <AlertCircle className="h-3 w-3" /> Failed
      </span>
    );
  }
  if (status === "reverted") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <RotateCcw className="h-3 w-3" /> Reverted
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <X className="h-3 w-3" /> Dismissed
    </span>
  );
}
