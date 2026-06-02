import { format } from "date-fns";
import { Clock } from "lucide-react";
import { splitEntrySecondsByDate } from "../../services/statsService";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { toDateKey } from "../../utils/date";
import { formatDurationCompact } from "../../utils/duration";
import { EmptyState } from "../ui/EmptyState";

export function TodayLog() {
  const entries = useTaskStore((state) => state.todayEntries);
  const now = useTimerStore((state) => state.now);
  const today = toDateKey(now);

  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Today Log
      </div>
      <div className="grid gap-2">
        {entries.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No time entries yet."
            hint="Start a task to begin tracking."
            dashed
          />
        ) : (
          entries.map((entry) => {
            const start = new Date(entry.start_at);
            const end = entry.end_at ? new Date(entry.end_at) : now;
            const duration = splitEntrySecondsByDate(entry, today, now);
            const estimateSeconds = (entry.task_estimated_minutes ?? 0) * 60;
            return (
              <div
                key={entry.id}
                className="rounded-xl border border-border bg-surface p-3 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {entry.task_title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {format(start, "HH:mm")} –{" "}
                        {entry.end_at ? format(end, "HH:mm") : "now"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{entry.category_name ?? "Inbox"}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-foreground">
                      {formatDurationCompact(duration)}
                    </div>
                    {estimateSeconds > 0 ? (
                      <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        / {formatDurationCompact(estimateSeconds)}
                      </div>
                    ) : null}
                  </div>
                </div>
                {entry.note ? (
                  <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                    {entry.note}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
