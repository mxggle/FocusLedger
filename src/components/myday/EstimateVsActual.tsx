import type { TodayStats } from "../../types";
import { formatDurationCompact, formatSignedDurationCompact } from "../../utils/duration";
import { Panel } from "./Panel";

/** Planned time (from estimates) against what the day actually took. */
export function EstimateVsActual({ stats }: { stats: TodayStats }) {
  const planned = stats.estimatedSeconds;
  const actual = stats.actualSeconds;
  const max = Math.max(planned, actual, 1);

  if (planned === 0 && actual === 0) {
    return (
      <Panel title="Estimate vs reality">
        <p className="py-6 text-center text-sm text-muted-foreground">
          Add task estimates to compare planned time against reality.
        </p>
      </Panel>
    );
  }

  const driftLabel =
    planned === 0
      ? "No plan was set for this day"
      : stats.driftSeconds === 0
        ? "Right on plan"
        : `${formatSignedDurationCompact(stats.driftSeconds)} ${stats.driftSeconds > 0 ? "over" : "under"} plan`;

  return (
    <Panel title="Estimate vs reality">
      <div className="space-y-4">
        <Bar
          label="Planned"
          value={formatDurationCompact(planned)}
          widthPct={(planned / max) * 100}
          color="hsl(var(--muted-foreground) / 0.35)"
        />
        <Bar
          label="Actual"
          value={formatDurationCompact(actual)}
          widthPct={(actual / max) * 100}
          color="hsl(var(--primary))"
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{driftLabel}</p>
    </Panel>
  );
}

function Bar({
  label,
  value,
  widthPct,
  color
}: {
  label: string;
  value: string;
  widthPct: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted/60">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(widthPct, 2)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
