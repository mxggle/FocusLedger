import { Check, Plus, Play, CalendarClock, Inbox, Trash2, X } from "lucide-react";
import type { ComponentType } from "react";
import type { AssistantActionType, ProposedAction } from "../../services/ai/assistant/types";
import { Button } from "../ui/Button";

const ICONS: Record<AssistantActionType, ComponentType<{ className?: string }>> = {
  create_task: Plus,
  reschedule_task: CalendarClock,
  move_to_backlog: Inbox,
  drop_task: Trash2,
  complete_task: Check,
  start_task: Play
};

type ActionCardProps = {
  action: ProposedAction;
  onApply: () => void;
  onDismiss: () => void;
};

export function ActionCard({ action, onApply, onDismiss }: ActionCardProps) {
  const Icon = ICONS[action.type];

  return (
    <div
      className={
        "flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm " +
        (action.status === "applied" ? "opacity-70" : "")
      }
    >
      <Icon
        className={
          "h-4 w-4 shrink-0 " + (action.destructive ? "text-destructive" : "text-primary")
        }
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-foreground">{action.summary}</p>
        {action.status === "failed" && action.error ? (
          <p className="truncate text-xs text-destructive">{action.error}</p>
        ) : null}
      </div>

      {action.status === "pending" ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant={action.destructive ? "danger" : "primary"} onClick={onApply}>
            Apply
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-xs capitalize text-muted-foreground">{action.status}</span>
      )}
    </div>
  );
}
