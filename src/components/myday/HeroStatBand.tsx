import { CheckCircle2, Clock, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TodayStats } from "../../types";
import { formatDurationCompact, formatSignedDurationCompact } from "../../utils/duration";

/**
 * The headline truth of the day: time focused, tasks completed, and how far
 * actual focus drifted from the day's plan.
 */
export function HeroStatBand({ stats }: { stats: TodayStats }) {
  const hasPlan = stats.estimatedSeconds > 0;
  const driftTone =
    stats.driftSeconds > 0 ? "text-warning" : "text-foreground";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Stat
        icon={Clock}
        value={formatDurationCompact(stats.totalFocusSeconds)}
        label="focused"
        primary
      />
      <Stat
        icon={CheckCircle2}
        value={String(stats.completedTaskCount)}
        label={stats.completedTaskCount === 1 ? "task done" : "tasks done"}
        sub={stats.droppedTaskCount > 0 ? `${stats.droppedTaskCount} dropped` : undefined}
      />
      <Stat
        icon={Target}
        value={hasPlan ? formatSignedDurationCompact(stats.driftSeconds) : "—"}
        valueClassName={hasPlan ? driftTone : "text-muted-foreground"}
        label={hasPlan ? (stats.driftSeconds >= 0 ? "over plan" : "under plan") : "no plan set"}
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  sub,
  primary = false,
  valueClassName
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  sub?: string;
  primary?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div
        className={`tabular-nums tracking-tight ${primary ? "text-4xl font-bold" : "text-3xl font-semibold"} ${
          valueClassName ?? "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {label}
        {sub ? <span className="text-muted-foreground/70"> · {sub}</span> : null}
      </div>
    </div>
  );
}
