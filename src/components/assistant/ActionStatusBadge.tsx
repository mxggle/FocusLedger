import { AlertCircle, Check, X } from "lucide-react";
import type { ActionStatus } from "../../services/ai/assistant/types";

/** A compact, color-coded badge for a resolved proposal (applied/failed/dismissed). */
export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  if (status === "applied") {
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
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <X className="h-3 w-3" /> Dismissed
    </span>
  );
}
