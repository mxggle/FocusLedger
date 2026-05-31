import { Target } from "lucide-react";
import { calculateTodayStats } from "../../services/statsService";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { toDateKey } from "../../utils/date";
import { formatDurationCompact, formatSignedDurationCompact } from "../../utils/duration";

export function TodaySummary() {
  const allTasks = useTaskStore((state) => state.allTasks);
  const categories = useTaskStore((state) => state.categories);
  const todayEntries = useTaskStore((state) => state.todayEntries);
  const now = useTimerStore((state) => state.now);
  const targetMinutes = useSettingsStore((state) => state.settings.dailyFocusTargetMinutes);
  const stats = calculateTodayStats({
    date: toDateKey(now),
    tasks: allTasks,
    timeEntries: todayEntries,
    categories,
    now
  });

  const targetSeconds = targetMinutes * 60;
  const targetProgress = targetSeconds ? Math.min(100, Math.round((stats.totalFocusSeconds / targetSeconds) * 100)) : 0;

  return (
    <div className="mt-6 rounded-md border bg-background p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Target className="h-4 w-4" />
        Today Summary
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric label="Total Focus" value={formatDurationCompact(stats.totalFocusSeconds)} />
        <Metric label="Completed" value={String(stats.completedTaskCount)} />
        <Metric label="Estimated" value={formatDurationCompact(stats.estimatedSeconds)} />
        <Metric label="Actual" value={formatDurationCompact(stats.actualSeconds)} />
        <Metric label="Time Drift" value={formatSignedDurationCompact(stats.driftSeconds)} />
        <Metric label="Daily Target" value={`${targetProgress}%`} />
      </div>
      <div className="mt-4 grid gap-2">
        {stats.categoryStats.map((category) => (
          <div key={category.categoryId} className="flex items-center justify-between text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color ?? "#71717a" }} />
              <span className="truncate">{category.categoryName}</span>
            </div>
            <span className="font-medium">{formatDurationCompact(category.totalSeconds)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
