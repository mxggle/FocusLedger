import { Target } from "lucide-react";
import { calculateTodayStats } from "../../services/statsService";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { toDateKey } from "../../utils/date";
import {
  formatDurationCompact,
  formatSignedDurationCompact
} from "../../utils/duration";
import { Progress } from "../ui/Progress";

export function TodaySummary() {
  const allTasks = useTaskStore((state) => state.allTasks);
  const categories = useTaskStore((state) => state.categories);
  const todayEntries = useTaskStore((state) => state.todayEntries);
  const now = useTimerStore((state) => state.now);
  const targetMinutes = useSettingsStore(
    (state) => state.settings.dailyFocusTargetMinutes
  );

  const stats = calculateTodayStats({
    date: toDateKey(now),
    tasks: allTasks,
    timeEntries: todayEntries,
    categories,
    now
  });

  const targetSeconds = targetMinutes * 60;
  const targetProgress = targetSeconds
    ? Math.min(100, Math.round((stats.totalFocusSeconds / targetSeconds) * 100))
    : 0;

  return (
    <div className="mt-5 rounded-xl border border-border bg-surface p-4 shadow-card">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today Summary
        </span>
      </div>

      {/* Daily target progress */}
      {targetSeconds > 0 ? (
        <div className="mb-4">
          <Progress value={targetProgress} label="Daily target" />
        </div>
      ) : null}

      {/* Metric grid — 2-column */}
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Total Focus" value={formatDurationCompact(stats.totalFocusSeconds)} />
        <Metric label="Completed" value={String(stats.completedTaskCount)} />
        <Metric label="Estimated" value={formatDurationCompact(stats.estimatedSeconds)} />
        <Metric label="Actual" value={formatDurationCompact(stats.actualSeconds)} />
        <Metric
          label="Time Drift"
          value={formatSignedDurationCompact(stats.driftSeconds)}
          muted={stats.driftSeconds === 0}
        />
        <Metric label="Target" value={`${targetProgress}%`} />
      </div>

      {/* Category breakdown */}
      {stats.categoryStats.length > 0 ? (
        <div className="mt-4 grid gap-2 border-t border-border pt-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            By category
          </div>
          {stats.categoryStats.map((category) => (
            <div
              key={category.categoryId}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: category.color ?? "hsl(var(--muted-foreground))" }}
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
  );
}

function Metric({
  label,
  value,
  muted
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-2.5 ring-1 ring-inset ring-border/50">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 text-base font-semibold tabular-nums ${
          muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
