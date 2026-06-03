import { format } from "date-fns";
import { Clock } from "lucide-react";
import { splitEntrySecondsByDate } from "../../services/statsService";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { resolveCategoryColor } from "../../utils/category";
import { cn } from "../../utils/cn";
import { toDateKey } from "../../utils/date";
import { formatDurationCompact } from "../../utils/duration";
import { EmptyState } from "../ui/EmptyState";

export function TodayLog() {
  const entries = useTaskStore((state) => state.todayEntries);
  const now = useTimerStore((state) => state.now);
  const today = toDateKey(now);

  // Entries arrive newest-first; a day timeline reads earliest → latest.
  const timeline = [...entries].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Today Log
      </div>
      {timeline.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No time entries yet."
          hint="Start a task to begin tracking."
          dashed
        />
      ) : (
        <ol className="relative">
          {timeline.map((entry, index) => {
            const start = new Date(entry.start_at);
            const end = entry.end_at ? new Date(entry.end_at) : now;
            const duration = splitEntrySecondsByDate(entry, today, now);
            const estimateSeconds = (entry.task_estimated_minutes ?? 0) * 60;
            const dotColor = resolveCategoryColor(entry.category_color);
            const ongoing = !entry.end_at;
            const isLast = index === timeline.length - 1;

            return (
              <li key={entry.id} className="flex items-stretch gap-3">
                {/* Time anchor */}
                <div className="w-11 shrink-0 pt-3 text-right tabular-nums">
                  <div className="text-xs font-semibold text-foreground">
                    {format(start, "HH:mm")}
                  </div>
                  <div className="text-[10px] leading-tight text-muted-foreground">
                    {ongoing ? "now" : format(end, "HH:mm")}
                  </div>
                </div>

                {/* Rail with node + connector */}
                <div className="flex w-3 shrink-0 flex-col items-center">
                  <span className="relative mt-3 flex h-3 w-3 shrink-0 items-center justify-center">
                    {ongoing ? (
                      <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
                        style={{ backgroundColor: dotColor }}
                      />
                    ) : null}
                    <span
                      className="relative inline-flex h-3 w-3 rounded-full ring-2 ring-surface"
                      style={{ backgroundColor: dotColor }}
                    />
                  </span>
                  {!isLast ? <span className="w-px flex-1 bg-border" /> : null}
                </div>

                {/* Entry card */}
                <div
                  className={cn(
                    "mb-2 min-w-0 flex-1 rounded-xl border bg-surface p-3 shadow-card",
                    ongoing ? "border-primary/40 ring-1 ring-primary/10" : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {entry.task_title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                          style={{ backgroundColor: dotColor }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{entry.category_name ?? "Inbox"}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums text-foreground">
                        {formatDurationCompact(duration)}
                      </div>
                      {estimateSeconds > 0 ? (
                        <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
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
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
