import { format } from "date-fns";
import { CalendarDays, Clock } from "lucide-react";
import { useState } from "react";
import { splitEntrySecondsByDate } from "../../services/statsService";
import { useTaskStore } from "../../stores/taskStore";
import { formatDateLabel } from "../../utils/date";
import {
  formatDurationCompact,
  formatSignedDurationCompact
} from "../../utils/duration";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input } from "../ui/Field";
import { PageHeader } from "../ui/PageHeader";

export function HistoryPage() {
  const selectedDate = useTaskStore((state) => state.selectedDate);
  const setSelectedDate = useTaskStore((state) => state.setSelectedDate);
  const historyStats = useTaskStore((state) => state.historyStats);
  const entries = useTaskStore((state) => state.selectedDateEntries);

  // The store refresh is async; dim the detail area while a switch is in flight
  // so the panel doesn't look frozen mid-load.
  const [switching, setSwitching] = useState(false);
  async function changeDate(date: string) {
    setSwitching(true);
    try {
      await setSelectedDate(date);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-7">
      <PageHeader
        icon={CalendarDays}
        eyebrow="History"
        title="Last 7 days"
        actions={
          <Field label="Inspect date">
            <Input
              type="date"
              value={selectedDate}
              onChange={(event) => void changeDate(event.target.value)}
            />
          </Field>
        }
      />

      {/* Day grid */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7">
        {historyStats.map((day) => {
          const isSelected = day.date === selectedDate;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => void changeDate(day.date)}
              aria-pressed={isSelected}
              className={`rounded-xl border p-3 text-left outline-none transition-[transform,box-shadow,border-color,background-color] duration-fast hover:-translate-y-0.5 focus-visible:shadow-ring ${
                isSelected
                  ? "border-primary/40 bg-primary-soft shadow-md ring-1 ring-inset ring-primary/10"
                  : "border-border bg-surface hover:border-border-strong hover:shadow-md"
              }`}
            >
              <div className={`text-xs ${isSelected ? "text-primary-soft-foreground/70" : "text-muted-foreground"}`}>
                {formatDateLabel(day.date)}
              </div>
              <div
                className={`mt-2 text-lg font-semibold tabular-nums ${
                  isSelected ? "text-primary-soft-foreground" : "text-foreground"
                }`}
              >
                {formatDurationCompact(day.totalFocusSeconds)}
              </div>
              <div className={`mt-1 text-xs ${isSelected ? "text-primary-soft-foreground/70" : "text-muted-foreground"}`}>
                {day.completedTaskCount} done
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail area */}
      <div
        aria-busy={switching}
        className={`mt-6 grid gap-5 transition-opacity duration-fast lg:grid-cols-[280px_1fr] ${
          switching ? "opacity-60" : "opacity-100"
        }`}
      >
        {/* Stats sidebar */}
        <aside className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {formatDateLabel(selectedDate)}
          </div>
          {historyStats
            .filter((day) => day.date === selectedDate)
            .map((day) => (
              <div key={day.date} className="mt-4 grid gap-2.5">
                <Metric
                  label="Total focus"
                  value={formatDurationCompact(day.totalFocusSeconds)}
                />
                <Metric
                  label="Completed tasks"
                  value={String(day.completedTaskCount)}
                />
                <Metric
                  label="Dropped tasks"
                  value={String(day.droppedTaskCount)}
                />
                <Metric
                  label="Time drift"
                  value={formatSignedDurationCompact(day.driftSeconds)}
                />
                {day.categoryStats.length > 0 ? (
                  <div className="mt-1 grid gap-2 border-t border-border pt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      By category
                    </div>
                    {day.categoryStats.map((category) => (
                      <div
                        key={category.categoryId}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                category.color ?? "hsl(var(--muted-foreground))"
                            }}
                          />
                          <span className="truncate text-xs text-muted-foreground">
                            {category.categoryName}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                          {formatDurationCompact(category.totalSeconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
        </aside>

        {/* Time records */}
        <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Time Records
          </div>
          <div className="grid gap-2">
            {entries.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No entries for this date."
                hint="Select a day with recorded focus sessions."
                dashed
              />
            ) : (
              entries.map((entry) => {
                const start = new Date(entry.start_at);
                const end = entry.end_at ? new Date(entry.end_at) : new Date();
                const seconds = splitEntrySecondsByDate(
                  entry,
                  selectedDate,
                  end
                );
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-border bg-background p-3"
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
                          <span className="truncate">
                            {entry.category_name ?? "Inbox"}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {formatDurationCompact(seconds)}
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
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2/60 px-3 py-2 ring-1 ring-inset ring-border/50">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
