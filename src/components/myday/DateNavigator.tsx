import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { parseDateKey, toDateKey } from "../../utils/date";

type DateNavigatorProps = {
  date: string;
  today: string;
  onChange: (date: string) => void;
};

/**
 * Steps through days for the My Day review. "Next" is disabled once the view
 * reaches today — there is no future day to debrief.
 */
export function DateNavigator({ date, today, onChange }: DateNavigatorProps) {
  const current = parseDateKey(date);
  const isToday = date === today;
  const atFuture = date >= today;

  const go = (delta: number) => onChange(toDateKey(addDays(current, delta)));

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => go(-1)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="min-w-[150px] text-center">
        <div className="text-sm font-semibold tracking-tight text-foreground">
          {isToday ? "Today" : format(current, "EEEE")}
        </div>
        <div className="text-xs text-muted-foreground">
          {format(current, "MMM d, yyyy")}
        </div>
      </div>

      <button
        type="button"
        aria-label="Next day"
        onClick={() => go(1)}
        disabled={atFuture}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <input
        type="date"
        value={date}
        max={today}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        aria-label="Pick a day"
        className="ml-1 h-9 rounded-lg border border-border bg-surface px-2 text-xs text-muted-foreground outline-none transition-colors hover:border-border-strong focus-visible:shadow-ring"
      />
    </div>
  );
}
