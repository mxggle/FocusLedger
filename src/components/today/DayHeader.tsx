import { format } from "date-fns";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { resolveCategoryColor } from "../../utils/category";
import { formatDurationCompact } from "../../utils/duration";

const DAY_MS = 24 * 60 * 60 * 1000;

function greetingFor(hour: number): string {
  if (hour < 5) return "Small hours";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The page's hero strip: today's date, a live clock, and the day line — a
 * midnight-to-midnight timeline where every tracked session paints a segment
 * in its category color. It is the product's promise in one glance: this is
 * where your time actually went today.
 */
export function DayHeader() {
  const now = useTimerStore((state) => state.now);
  const todayEntries = useTaskStore((state) => state.todayEntries);

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const nowPct = Math.min(100, ((now.getTime() - dayStartMs) / DAY_MS) * 100);

  const segments = todayEntries.map((entry) => {
    const start = Math.max(new Date(entry.start_at).getTime(), dayStartMs);
    const end = entry.end_at ? new Date(entry.end_at).getTime() : now.getTime();
    const left = ((start - dayStartMs) / DAY_MS) * 100;
    // Clamp to a visible sliver so short sessions still register on the line.
    const width = Math.max(0.35, ((end - start) / DAY_MS) * 100);
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    return {
      id: entry.id,
      left,
      width,
      color: resolveCategoryColor(entry.category_color),
      label: `${entry.task_title} · ${formatDurationCompact(seconds)}`
    };
  });

  const focusedSeconds = todayEntries.reduce((sum, entry) => {
    if (entry.duration_seconds != null) return sum + entry.duration_seconds;
    const live = (now.getTime() - new Date(entry.start_at).getTime()) / 1000;
    return sum + Math.max(0, Math.floor(live));
  }, 0);

  return (
    <header className="shrink-0 px-5 pb-3 pt-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold leading-tight tracking-tight">
            <span className="text-gradient">{format(now, "EEEE")}</span>
            <span className="font-semibold text-muted-foreground">
              {format(now, ", MMMM d")}
            </span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {greetingFor(now.getHours())} — make the hours count.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
            {format(now, "HH:mm")}
          </div>
          <div className="mt-1 text-[11px] font-medium tabular-nums text-muted-foreground">
            {focusedSeconds > 0
              ? `${formatDurationCompact(focusedSeconds)} focused`
              : "nothing tracked yet"}
          </div>
        </div>
      </div>

      {/* Day line — 24h track. Tracked sessions paint category-colored
          segments; a marker rides the present moment. Pure narration of data
          the panes already own, so it needs no interaction. */}
      <div aria-hidden="true" className="relative mt-3 h-1.5">
        <div className="absolute inset-0 overflow-hidden rounded-full bg-muted/80 ring-1 ring-inset ring-border/50">
          {/* Elapsed-day wash, so the empty morning still reads as "spent" */}
          <div
            className="absolute inset-y-0 left-0 bg-foreground/[0.05]"
            style={{ width: `${nowPct}%` }}
          />
          {/* Quarter-day ticks (06 / 12 / 18) */}
          {[25, 50, 75].map((tick) => (
            <span
              key={tick}
              className="absolute inset-y-0 w-px bg-border-strong/60"
              style={{ left: `${tick}%` }}
            />
          ))}
          {segments.map((segment) => (
            <span
              key={segment.id}
              title={segment.label}
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${segment.left}%`,
                width: `${segment.width}%`,
                backgroundColor: segment.color
              }}
            />
          ))}
        </div>
        {/* Now marker — a knob at the tip of the elapsed day */}
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary shadow-sm"
          style={{ left: `${nowPct}%` }}
        />
      </div>
    </header>
  );
}
