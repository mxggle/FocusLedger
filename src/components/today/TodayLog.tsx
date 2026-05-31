import { format } from "date-fns";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { formatDurationCompact } from "../../utils/duration";

export function TodayLog() {
  const entries = useTaskStore((state) => state.todayEntries);
  const now = useTimerStore((state) => state.now);

  return (
    <div>
      <div className="mb-3 text-sm font-semibold">Today Log</div>
      <div className="grid gap-2">
        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No time entries yet.</div>
        ) : (
          entries.map((entry) => {
            const start = new Date(entry.start_at);
            const end = entry.end_at ? new Date(entry.end_at) : now;
            const duration = entry.duration_seconds ?? Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
            const estimateSeconds = (entry.task_estimated_minutes ?? 0) * 60;
            return (
              <div key={entry.id} className="rounded-md border bg-background p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{entry.task_title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {format(start, "HH:mm")} - {entry.end_at ? format(end, "HH:mm") : "now"} · {entry.category_name ?? "Inbox"}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs font-semibold tabular-nums">
                    Duration {formatDurationCompact(duration)}
                    {estimateSeconds > 0 ? ` / Estimate ${formatDurationCompact(estimateSeconds)}` : " / No estimate"}
                  </div>
                </div>
                {entry.note ? <div className="mt-2 text-xs text-muted-foreground">{entry.note}</div> : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
