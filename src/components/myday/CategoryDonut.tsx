import type { TodayStats } from "../../types";
import { formatDurationCompact } from "../../utils/duration";
import { buildDonutModel, DONUT_CIRCUMFERENCE } from "./donutModel";
import { Panel } from "./Panel";

const RADIUS = DONUT_CIRCUMFERENCE / (2 * Math.PI);
const CENTER = 21;

/** Where the hours went, as a donut with a category legend. */
export function CategoryDonut({ stats }: { stats: TodayStats }) {
  const { segments, totalSeconds } = buildDonutModel(stats.categoryStats);

  return (
    <Panel title="Where the time went">
      {segments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No category time to break down yet.
        </p>
      ) : (
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <svg width="120" height="120" viewBox="0 0 42 42" className="-rotate-90">
              <circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="5"
              />
              {segments.map((segment) => (
                <circle
                  key={segment.categoryId}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="5"
                  strokeDasharray={segment.dashArray}
                  strokeDashoffset={segment.dashOffset}
                  strokeLinecap="butt"
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-bold tabular-nums tracking-tight text-foreground">
                {formatDurationCompact(totalSeconds)}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                total
              </span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-2">
            {segments.map((segment) => (
              <li key={segment.categoryId} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className="truncate text-sm text-foreground">{segment.categoryName}</span>
                </div>
                <div className="flex shrink-0 items-baseline gap-1.5">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatDurationCompact(segment.seconds)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {Math.round(segment.pct)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
