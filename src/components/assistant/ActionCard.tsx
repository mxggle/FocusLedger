import { Check, Pencil, Play, CalendarClock, Inbox, Trash2, X } from "lucide-react";
import type { ComponentType } from "react";
import type { AssistantActionType, ProposedAction } from "../../services/ai/assistant/types";
import { useAssistantStore } from "../../stores/assistantStore";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { ActionStatusBadge } from "./ActionStatusBadge";
import { CreateTaskCard } from "./CreateTaskCard";

const ICONS: Record<Exclude<AssistantActionType, "create_task">, ComponentType<{ className?: string }>> = {
  update_task: Pencil,
  reschedule_task: CalendarClock,
  move_to_backlog: Inbox,
  drop_task: Trash2,
  complete_task: Check,
  start_task: Play
};

type ActionCardProps = {
  messageId: string;
  action: ProposedAction;
  onApply: () => void;
  onDismiss: () => void;
};

export function ActionCard({ messageId, action, onApply, onDismiss }: ActionCardProps) {
  if (action.type === "create_task") {
    return (
      <CreateTaskCard messageId={messageId} action={action} onApply={onApply} onDismiss={onDismiss} />
    );
  }

  const Icon = ICONS[action.type];
  const pending = action.status === "pending";

  return (
    <div
      className={
        "flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm shadow-xs " +
        (action.status === "dismissed" ? "opacity-60" : "")
      }
    >
      <div className="flex items-center gap-2.5">
        <Icon
          className={"h-4 w-4 shrink-0 " + (action.destructive ? "text-destructive" : "text-primary")}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-foreground">{action.summary}</p>
          {action.status === "failed" && action.error ? (
            <p className="truncate text-xs text-destructive">{action.error}</p>
          ) : null}
        </div>
        {pending ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant={action.destructive ? "danger" : "primary"} onClick={onApply}>
              Apply
            </Button>
          </div>
        ) : (
          <ActionStatusBadge status={action.status} />
        )}
      </div>

      {pending && action.type === "reschedule_task" ? <RescheduleDate messageId={messageId} action={action} /> : null}
    </div>
  );
}

/** Inline date editor for a reschedule proposal. */
function RescheduleDate({ messageId, action }: { messageId: string; action: ProposedAction }) {
  const update = useAssistantStore((state) => state.updateActionParams);
  const dueDate = (action.params as { due_date?: string }).due_date ?? "";

  return (
    <div className="flex items-center gap-2 pl-6">
      <span className="text-xs text-muted-foreground">Move to</span>
      <Input
        type="date"
        value={dueDate}
        onChange={(event) => {
          if (event.target.value) update(messageId, action.id, { due_date: event.target.value });
        }}
        aria-label="New date"
        className="h-8 w-auto text-xs"
      />
    </div>
  );
}
