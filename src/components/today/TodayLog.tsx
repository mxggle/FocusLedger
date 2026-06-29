import { format } from "date-fns";
import { Clock, Coffee, Minus } from "lucide-react";
import { Fragment, useState } from "react";
import { splitEntrySecondsByDate } from "../../services/statsService";
import { useRestStore } from "../../stores/restStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import type { RestSession, TimeEntryWithTask } from "../../types";
import { resolveCategoryColor } from "../../utils/category";
import { cn } from "../../utils/cn";
import { toDateKey } from "../../utils/date";
import { formatDurationCompact } from "../../utils/duration";
import { REST_ACCENT } from "../ambient/accent";
import { EmptyState } from "../ui/EmptyState";
import { EntryDetailDialog } from "./EntryDetailDialog";

// Ignore sub-minute slivers between back-to-back items; surface real breaks.
const MIN_GAP_SECONDS = 60;

// A merged day timeline mixes tracked work with rest. Rest is intentionally not
// an entry: it has no task, never opens the edit dialog, and is styled as a calm
// marker so it can be *seen* without ever reading as a task.
type TimelineItem =
  | { kind: "entry"; id: string; start: Date; end: Date; ongoing: boolean; entry: TimeEntryWithTask }
  | { kind: "rest"; id: string; start: Date; end: Date; ongoing: boolean; session: RestSession };

export function TodayLog() {
  const entries = useTaskStore((state) => state.todayEntries);
  const restSessions = useRestStore((state) => state.todayRestSessions);
  const now = useTimerStore((state) => state.now);
  const today = toDateKey(now);
  // Track the open entry by id so the dialog stays in sync after a refresh.
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const detailEntry = entries.find((entry) => entry.id === detailEntryId) ?? null;

  // Merge entries + rest into one chronological timeline (earliest → latest).
  const timeline: TimelineItem[] = [
    ...entries.map<TimelineItem>((entry) => ({
      kind: "entry",
      id: entry.id,
      start: new Date(entry.start_at),
      end: entry.end_at ? new Date(entry.end_at) : now,
      ongoing: !entry.end_at,
      entry
    })),
    ...restSessions.map<TimelineItem>((session) => ({
      kind: "rest",
      id: session.id,
      start: new Date(session.start_at),
      end: session.end_at ? new Date(session.end_at) : now,
      ongoing: !session.end_at,
      session
    }))
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  // Untracked time between the end of one item and the start of the next.
  const gapBefore = (index: number): number => {
    if (index === 0) return 0;
    const prev = timeline[index - 1];
    const seconds = (timeline[index].start.getTime() - prev.end.getTime()) / 1000;
    return seconds >= MIN_GAP_SECONDS ? seconds : 0;
  };

  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Today Log
      </div>
      {timeline.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No time entries yet."
          hint="Start a task to begin tracking."
          dashed
        />
      ) : (
        <ol className="relative">
          {timeline.map((item, index) => {
            const isLast = index === timeline.length - 1;
            const gapSeconds = gapBefore(index);

            return (
              <Fragment key={`${item.kind}-${item.id}`}>
                {gapSeconds > 0 ? (
                  <li className="flex items-stretch gap-3">
                    {/* Empty time column keeps the gap aligned with the rail. */}
                    <div className="w-11 shrink-0" aria-hidden="true" />
                    {/* Dashed rail signals untracked time between items. */}
                    <div className="flex w-3 shrink-0 justify-center">
                      <span className="border-l border-dashed border-border" />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center py-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                        <Minus className="h-3 w-3" aria-hidden="true" />
                        {formatDurationCompact(gapSeconds)} gap
                      </span>
                    </div>
                  </li>
                ) : null}
                {item.kind === "rest" ? (
                  <RestRow item={item} now={now} isLast={isLast} />
                ) : (
                  <EntryRow
                    item={item}
                    today={today}
                    now={now}
                    isLast={isLast}
                    onOpen={() => setDetailEntryId(item.entry.id)}
                  />
                )}
              </Fragment>
            );
          })}
        </ol>
      )}
      <EntryDetailDialog
        entry={detailEntry}
        open={detailEntry !== null}
        onClose={() => setDetailEntryId(null)}
      />
    </div>
  );
}

function EntryRow({
  item,
  today,
  now,
  isLast,
  onOpen
}: {
  item: Extract<TimelineItem, { kind: "entry" }>;
  today: string;
  now: Date;
  isLast: boolean;
  onOpen: () => void;
}) {
  const { entry, start, end, ongoing } = item;
  const duration = splitEntrySecondsByDate(entry, today, now);
  const estimateSeconds = (entry.task_estimated_minutes ?? 0) * 60;
  const dotColor = resolveCategoryColor(entry.category_color);

  return (
    <li className="flex items-stretch gap-3">
      {/* Time anchor */}
      <div className="w-11 shrink-0 pt-3 text-right tabular-nums">
        <div className="text-xs font-semibold text-foreground">{format(start, "HH:mm")}</div>
        <div className="text-[10px] leading-tight text-muted-foreground">
          {ongoing ? "now" : format(end, "HH:mm")}
        </div>
      </div>

      {/* Rail with node + connector */}
      <div className="flex w-3 shrink-0 flex-col items-center">
        <span className="relative mt-3 flex h-3 w-3 shrink-0 items-center justify-center">
          {ongoing ? (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
              style={{ backgroundColor: dotColor }}
            />
          ) : null}
          <span
            className="relative inline-flex h-3 w-3 rounded-full ring-2 ring-surface"
            style={{ backgroundColor: dotColor }}
          />
        </span>
        {!isLast ? <span className="w-px flex-1 bg-border" /> : null}
      </div>

      {/* Entry card — opens the detail/edit dialog. */}
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "mb-2 min-w-0 flex-1 rounded-xl border bg-surface p-3 text-left shadow-card",
          "transition-[border-color,box-shadow] duration-fast hover:border-border-strong",
          "focus-visible:outline-none focus-visible:shadow-ring",
          ongoing ? "border-primary/40 ring-1 ring-primary/10" : "border-border"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{entry.task_title}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: dotColor }}
                aria-hidden="true"
              />
              <span className="truncate">{entry.category_name ?? "Inbox"}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold tabular-nums text-foreground">
              {formatDurationCompact(duration)}
            </div>
            {estimateSeconds > 0 ? (
              <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                / {formatDurationCompact(estimateSeconds)}
              </div>
            ) : null}
          </div>
        </div>
        {entry.note ? (
          <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {entry.note}
          </div>
        ) : null}
      </button>
    </li>
  );
}

/**
 * A rest marker. Deliberately quieter than an entry — a small calm pill, no
 * card, not clickable — so it reads as "you stepped away", never as a task.
 */
function RestRow({
  item,
  now,
  isLast
}: {
  item: Extract<TimelineItem, { kind: "rest" }>;
  now: Date;
  isLast: boolean;
}) {
  const { start, end, ongoing } = item;
  const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
  const accent = `hsl(${REST_ACCENT})`;

  return (
    <li className="flex items-stretch gap-3">
      <div className="w-11 shrink-0 pt-2 text-right tabular-nums">
        <div className="text-xs font-semibold text-foreground">{format(start, "HH:mm")}</div>
      </div>

      {/* Rail node tinted in the rest accent so it sits apart from work nodes. */}
      <div className="flex w-3 shrink-0 flex-col items-center">
        <span className="relative mt-2.5 flex h-3 w-3 shrink-0 items-center justify-center">
          {ongoing ? (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
              style={{ backgroundColor: accent }}
            />
          ) : null}
          <span
            className="relative inline-flex h-3 w-3 rounded-full ring-2 ring-surface"
            style={{ backgroundColor: accent }}
          />
        </span>
        {!isLast ? <span className="w-px flex-1 bg-border" /> : null}
      </div>

      <div className="flex min-w-0 flex-1 items-center py-1.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums"
          style={{
            color: accent,
            backgroundColor: `hsl(${REST_ACCENT} / 0.12)`,
            boxShadow: `inset 0 0 0 1px hsl(${REST_ACCENT} / 0.22)`
          }}
        >
          <Coffee className="h-3 w-3" aria-hidden="true" />
          {ongoing ? "Resting…" : `Rest · ${formatDurationCompact(seconds)}`}
        </span>
      </div>
    </li>
  );
}
