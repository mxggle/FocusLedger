import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { splitEntrySecondsByDate } from "../../services/statsService";
import { useTaskStore } from "../../stores/taskStore";
import { formatDateLabel } from "../../utils/date";
import { formatDurationCompact, formatSignedDurationCompact } from "../../utils/duration";
import { Field, Input } from "../ui/Field";

export function HistoryPage() {
  const selectedDate = useTaskStore((state) => state.selectedDate);
  const setSelectedDate = useTaskStore((state) => state.setSelectedDate);
  const historyStats = useTaskStore((state) => state.historyStats);
  const entries = useTaskStore((state) => state.selectedDateEntries);

  return (
    <div className="h-screen overflow-y-auto p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            History
          </div>
          <h2 className="mt-1 text-2xl font-semibold">Last 7 days</h2>
        </div>
        <Field label="Inspect date">
          <Input type="date" value={selectedDate} onChange={(event) => void setSelectedDate(event.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {historyStats.map((day) => (
          <button
            key={day.date}
            type="button"
            onClick={() => void setSelectedDate(day.date)}
            className={`rounded-md border p-3 text-left transition hover:bg-muted ${
              day.date === selectedDate ? "border-primary bg-primary/10" : "bg-background"
            }`}
          >
            <div className="text-xs text-muted-foreground">{formatDateLabel(day.date)}</div>
            <div className="mt-2 text-lg font-semibold">{formatDurationCompact(day.totalFocusSeconds)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{day.completedTaskCount} done</div>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-md border bg-background p-4">
          <div className="text-sm font-semibold">{formatDateLabel(selectedDate)}</div>
          {historyStats
            .filter((day) => day.date === selectedDate)
            .map((day) => (
              <div key={day.date} className="mt-4 grid gap-3 text-sm">
                <Metric label="Total focus" value={formatDurationCompact(day.totalFocusSeconds)} />
                <Metric label="Completed tasks" value={String(day.completedTaskCount)} />
                <Metric label="Dropped tasks" value={String(day.droppedTaskCount)} />
                <Metric label="Time drift" value={formatSignedDurationCompact(day.driftSeconds)} />
                <div className="mt-2 grid gap-2">
                  {day.categoryStats.map((category) => (
                    <div key={category.categoryId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{category.categoryName}</span>
                      <span className="font-medium">{formatDurationCompact(category.totalSeconds)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </aside>

        <section className="rounded-md border bg-background p-4">
          <div className="mb-3 text-sm font-semibold">Time records</div>
          <div className="grid gap-2">
            {entries.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No entries for this date.</div>
            ) : (
              entries.map((entry) => {
                const start = new Date(entry.start_at);
                const end = entry.end_at ? new Date(entry.end_at) : new Date();
                const seconds = splitEntrySecondsByDate(entry, selectedDate, end);
                return (
                  <div key={entry.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{entry.task_title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {format(start, "HH:mm")} - {entry.end_at ? format(end, "HH:mm") : "now"} · {entry.category_name ?? "Inbox"}
                        </div>
                      </div>
                      <div className="shrink-0 font-semibold">{formatDurationCompact(seconds)}</div>
                    </div>
                    {entry.note ? <div className="mt-2 text-xs text-muted-foreground">{entry.note}</div> : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
