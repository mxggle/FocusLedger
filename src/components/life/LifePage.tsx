import { format } from "date-fns";
import { ArrowRight, Hourglass, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useAsyncResource } from "../../hooks/useAsyncResource";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import {
  loadLifeWeekFocus,
  peakDay,
  type LifeWeekFocus
} from "../../services/lifeService";
import { toDateKey } from "../../utils/date";
import { formatDurationCompact } from "../../utils/duration";
import { computeLifeProgress, weekRange } from "../../utils/lifeWeeks";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { Skeleton } from "../ui/Skeleton";
import { LifeSetup } from "./LifeSetup";
import { LifeWeeksGrid } from "./LifeWeeksGrid";

export type LifeNavTarget = "today" | "history" | "plan";

type LifePageProps = {
  onNavigate?: (route: LifeNavTarget) => void;
};

const EMPTY_FOCUS: LifeWeekFocus = { byWeek: new Map(), maxSeconds: 0 };

export function LifePage({ onNavigate }: LifePageProps) {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const setSelectedDate = useTaskStore((state) => state.setSelectedDate);
  const addToast = useUiStore((state) => state.addToast);
  const { birthDate, lifeExpectancyYears } = settings;

  const [editing, setEditing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);

  const progress = useMemo(
    () => computeLifeProgress(birthDate, lifeExpectancyYears),
    [birthDate, lifeExpectancyYears]
  );

  // Pull real tracked focus onto the grid (re-runs whenever this page mounts).
  const focusResource = useAsyncResource<LifeWeekFocus>(
    () => loadLifeWeekFocus(birthDate),
    EMPTY_FOCUS,
    [birthDate, progress],
    {
      enabled: Boolean(progress),
      onError: (error) => {
        console.error("Failed to load life focus", error);
        addToast({
          kind: "error",
          title: "Couldn't load your focus history",
          description: "The grid is showing without tracked focus. Try again."
        });
      }
    }
  );
  const focus = focusResource.data;

  async function handleSave(nextDate: string, nextYears: number) {
    if (nextDate !== birthDate) await updateSetting("birthDate", nextDate);
    if (nextYears !== lifeExpectancyYears) {
      await updateSetting("lifeExpectancyYears", nextYears);
    }
    setSelectedWeek(null);
    setEditing(false);
  }

  function inspectInHistory(weekIndex: number) {
    const week = focus.byWeek.get(weekIndex);
    const range = weekRange(birthDate, weekIndex);
    const day = peakDay(week) ?? (range ? toDateKey(range.start) : toDateKey());
    void setSelectedDate(day);
    onNavigate?.("history");
  }

  // First run (or invalid stored data): collect the inputs first.
  if (!progress) {
    return (
      <div className="h-full overflow-y-auto px-6 py-7">
        <div className="mx-auto max-w-2xl">
          <PageHeader
            icon={Hourglass}
            eyebrow="Memento Mori"
            title="Your life in weeks"
            description="Set your details to see every week of your life as a grid."
          />
          <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <LifeSetup
              birthDate={birthDate}
              lifeExpectancyYears={lifeExpectancyYears}
              onSave={handleSave}
            />
          </section>
        </div>
      </div>
    );
  }

  const defaultWeek =
    progress.currentWeekIndex >= 0
      ? progress.currentWeekIndex
      : Math.max(0, progress.weeksLived - 1);
  const activeWeek = hoveredWeek ?? selectedWeek ?? defaultWeek;

  return (
    <div className="flex h-full flex-col px-6 py-5">
      <PageHeader
        icon={Hourglass}
        eyebrow="Memento Mori"
        title="Your life in weeks"
        actions={
          <Button variant="secondary" size="sm" onClick={() => setEditing((value) => !value)}>
            <Pencil className="h-3.5 w-3.5" />
            Adjust
          </Button>
        }
      />

      {editing ? (
        <section className="mb-4 rounded-xl border border-border bg-surface p-5 shadow-card">
          <LifeSetup
            birthDate={birthDate}
            lifeExpectancyYears={lifeExpectancyYears}
            submitLabel="Save"
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        </section>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-5">
        {/* The grid */}
        <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="min-h-0 flex-1">
            <LifeWeeksGrid
              birthDate={birthDate}
              lifeExpectancyYears={lifeExpectancyYears}
              weeksLived={progress.weeksLived}
              currentWeekIndex={progress.currentWeekIndex}
              selectedWeek={selectedWeek}
              focusByWeek={focus.byWeek}
              maxFocusSeconds={focus.maxSeconds}
              onSelectWeek={setSelectedWeek}
              onHoverWeek={setHoveredWeek}
            />
          </div>
        </section>

        {/* Context + inspector */}
        <aside className="flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto">
          <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Lived" value={progress.weeksLived.toLocaleString()} />
              <Stat
                label="Left"
                value={progress.weeksRemaining.toLocaleString()}
                accent
              />
              <Stat label="Spent" value={`${progress.percentLived.toFixed(1)}%`} />
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-normal"
                style={{ width: `${progress.percentLived}%` }}
              />
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
              You're {progress.ageYears} — about{" "}
              <span className="font-semibold text-foreground">
                {progress.yearsRemaining}
              </span>{" "}
              {progress.yearsRemaining === 1 ? "year" : "years"} left. Don't waste
              the squares.
            </p>
          </section>

          <WeekInspector
            birthDate={birthDate}
            weekIndex={activeWeek}
            currentWeekIndex={progress.currentWeekIndex}
            weeksLived={progress.weeksLived}
            focus={focus}
            focusLoading={focusResource.loading}
            onOpenToday={() => onNavigate?.("today")}
            onInspectHistory={() => inspectInHistory(activeWeek)}
          />

          <Legend />
        </aside>
      </div>
    </div>
  );
}

function WeekInspector({
  birthDate,
  weekIndex,
  currentWeekIndex,
  weeksLived,
  focus,
  focusLoading,
  onOpenToday,
  onInspectHistory
}: {
  birthDate: string;
  weekIndex: number;
  currentWeekIndex: number;
  weeksLived: number;
  focus: LifeWeekFocus;
  focusLoading: boolean;
  onOpenToday: () => void;
  onInspectHistory: () => void;
}) {
  const range = weekRange(birthDate, weekIndex);
  if (!range) return null;

  const isCurrent = weekIndex === currentWeekIndex;
  const isPast = !isCurrent && weekIndex < weeksLived;
  const inclusiveEnd = new Date(range.end.getTime() - 1);
  const week = focus.byWeek.get(weekIndex);

  const distance =
    currentWeekIndex >= 0 ? Math.abs(weekIndex - currentWeekIndex) : 0;
  const status = isCurrent
    ? "This week"
    : isPast
      ? `${distance} ${distance === 1 ? "week" : "weeks"} ago`
      : `In ${distance} ${distance === 1 ? "week" : "weeks"}`;

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {status}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          Week {weekIndex + 1} · age {Math.floor(weekIndex / 52)}
        </span>
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">
        {format(range.start, "MMM d")} – {format(inclusiveEnd, "MMM d, yyyy")}
      </div>

      {/* Real tracked focus for this week */}
      <div className="mt-3 border-t border-border pt-3">
        {focusLoading ? (
          <div className="grid gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ) : week ? (
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Focus logged</span>
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {formatDurationCompact(week.seconds)}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {week.sessions} {week.sessions === 1 ? "session" : "sessions"}
            </div>
            {week.categories.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {week.categories.slice(0, 3).map((category) => (
                  <span
                    key={category.name}
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          category.color ?? "hsl(var(--muted-foreground))"
                      }}
                    />
                    {category.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isCurrent
              ? "No focus tracked yet this week. Make it count."
              : isPast
                ? "No focus tracked these days."
                : "Not here yet — what will you make of it?"}
          </p>
        )}
      </div>

      {/* Connection to the rest of the app */}
      {isCurrent ? (
        <Button size="sm" className="mt-3 w-full" onClick={onOpenToday}>
          Open Today
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      ) : isPast ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3 w-full"
          onClick={onInspectHistory}
        >
          Inspect in History
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  accent = false
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 text-[11px] text-muted-foreground">
      <LegendSwatch className="bg-primary" label="Focused" />
      <LegendSwatch style={{ backgroundColor: "hsl(var(--primary) / 0.28)" }} label="Lived" />
      <LegendSwatch className="bg-foreground" label="This week" />
      <LegendSwatch className="bg-muted" label="To come" />
    </div>
  );
}

function LegendSwatch({
  className,
  style,
  label
}: {
  className?: string;
  style?: React.CSSProperties;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`h-2.5 w-2.5 rounded-[2px] ${className ?? ""}`}
        style={style}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
