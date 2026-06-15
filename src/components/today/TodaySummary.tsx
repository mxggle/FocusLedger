import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Clock, Target, Zap } from "lucide-react";
import { calculateTodayStats } from "../../services/statsService";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { useUiStore } from "../../stores/uiStore";
import { cn } from "../../utils/cn";
import { toDateKey } from "../../utils/date";
import {
  formatDurationCompact,
  formatSignedDurationCompact
} from "../../utils/duration";

export function TodaySummary() {
  const allTasks = useTaskStore((state) => state.allTasks);
  const categories = useTaskStore((state) => state.categories);
  const todayEntries = useTaskStore((state) => state.todayEntries);
  const now = useTimerStore((state) => state.now);
  const targetMinutes = useSettingsStore(
    (state) => state.settings.dailyFocusTargetMinutes
  );
  const expanded = useUiStore((state) => state.todaySummaryExpanded);
  const toggleExpanded = useUiStore((state) => state.toggleTodaySummary);

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
  const targetMet = targetSeconds > 0 && targetProgress >= 100;

  return (
    // Sticky scorecard — pinned to the top of the Log pane so it stays visible
    // while the entry list scrolls beneath it. A faint primary wash gives it a
    // gentle "hero" presence without competing with the log cards below.
    <div className="sticky top-0 z-10 border-b border-border bg-gradient-to-b from-primary-soft/40 to-surface/95 backdrop-blur supports-[backdrop-filter]:to-surface/80">
      {/* Compact header — always visible. The whole row toggles details. */}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse today summary" : "Expand today summary"}
        className={cn(
          "group flex w-full flex-col gap-2.5 px-4 py-3.5 text-left outline-none",
          "hover:bg-foreground/[0.015] focus-visible:bg-foreground/[0.015]",
          "transition-colors duration-fast"
        )}
      >
        {/* Row 1: badge + label + target progress + chevron */}
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
              targetMet
                ? "bg-success-soft text-success ring-success/15"
                : "bg-primary-soft text-primary ring-primary/15"
            )}
          >
            <Target className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Today
          </span>

          {targetSeconds > 0 ? (
            <>
              <div className="ml-1 h-2 flex-1 overflow-hidden rounded-full bg-muted/80 ring-1 ring-inset ring-border/40">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    targetMet
                      ? "bg-gradient-to-r from-success/80 to-success"
                      : "bg-gradient-to-r from-primary/75 to-primary"
                  )}
                  initial={false}
                  animate={{ width: `${targetProgress}%` }}
                  transition={{ type: "spring", stiffness: 220, damping: 30 }}
                />
              </div>
              <span
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  targetMet ? "text-success" : "text-foreground"
                )}
              >
                {targetProgress}%
              </span>
            </>
          ) : (
            <div className="flex-1" />
          )}

          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-foreground">
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-normal",
                expanded && "rotate-180"
              )}
            />
          </span>
        </div>

        {/* Row 2: glanceable key figures as soft stat pills */}
        <div className="flex flex-wrap items-center gap-2 pl-[2.375rem]">
          <StatPill
            icon={Zap}
            label="Focus"
            value={formatDurationCompact(stats.totalFocusSeconds)}
          />
          <StatPill
            icon={Clock}
            label="Done"
            value={String(stats.completedTaskCount)}
          />
        </div>
      </button>

      {/* Expanded detail — full metric grid + category breakdown */}
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1">
              {/* Metric grid — 2-column */}
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Total Focus"
                  value={formatDurationCompact(stats.totalFocusSeconds)}
                />
                <Metric
                  label="Completed"
                  value={String(stats.completedTaskCount)}
                />
                <Metric
                  label="Estimated"
                  value={formatDurationCompact(stats.estimatedSeconds)}
                />
                <Metric
                  label="Actual"
                  value={formatDurationCompact(stats.actualSeconds)}
                />
                <Metric
                  label="Time Drift"
                  value={formatSignedDurationCompact(stats.driftSeconds)}
                  tone={driftTone(stats.driftSeconds)}
                />
                <Metric
                  label="Target"
                  value={`${targetProgress}%`}
                  tone={targetMet ? "success" : "default"}
                />
              </div>

              {/* Category breakdown — each row carries a proportion bar */}
              {stats.categoryStats.length > 0 ? (
                <div className="mt-4 border-t border-border pt-4">
                  <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    By category
                  </div>
                  <CategoryBreakdown categories={stats.categoryStats} />
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type Tone = "default" | "muted" | "success" | "warning";

function driftTone(driftSeconds: number): Tone {
  if (driftSeconds === 0) return "muted";
  return driftSeconds > 0 ? "warning" : "success";
}

function StatPill({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Zap;
  label: string;
  value: string;
}) {
  return (
    <span
      title={`${label}: ${value}`}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-surface/70 py-1 pl-2 pr-2.5 text-xs shadow-xs"
    >
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      {/* Label word is kept whenever there's room — the pill row wraps before
          labels drop — and only collapses below ~13rem of pane width. */}
      <span className="hidden text-muted-foreground @[13rem]:inline">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function CategoryBreakdown({
  categories
}: {
  categories: {
    categoryId: string;
    categoryName: string;
    color?: string | null;
    totalSeconds: number;
  }[];
}) {
  const max = Math.max(...categories.map((c) => c.totalSeconds), 1);

  return (
    <div className="grid gap-2.5">
      {categories.map((category) => {
        const color = category.color ?? "hsl(var(--muted-foreground))";
        const pct = Math.max(4, Math.round((category.totalSeconds / max) * 100));
        return (
          <div key={category.categoryId} className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate text-xs text-muted-foreground">
                  {category.categoryName}
                </span>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                {formatDurationCompact(category.totalSeconds)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/70">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 30 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const toneClass: Record<Tone, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  success: "text-success-soft-foreground",
  warning: "text-warning-soft-foreground"
};

function Metric({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-2.5 ring-1 ring-inset ring-border/50">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-base font-semibold tabular-nums", toneClass[tone])}>
        {value}
      </div>
    </div>
  );
}
