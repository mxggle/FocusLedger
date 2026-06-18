import { format } from "date-fns";
import { AlertTriangle, ArrowRight, ListChecks } from "lucide-react";
import type { TimeEntryWithTask } from "../../types";
import { formatDurationCompact } from "../../utils/duration";
import { EmptyState } from "../ui/EmptyState";
import { Panel } from "./Panel";

/** Per-session detail: note, blocker, next action, and felt-completion. */
export function SessionList({ entries }: { entries: TimeEntryWithTask[] }) {
  // Entries arrive newest-first from the store/repository; read chronologically.
  const chronological = [...entries].reverse();

  return (
    <Panel title="Focus sessions" aside={<span className="text-xs text-muted-foreground">{entries.length}</span>}>
      {chronological.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No focus sessions"
          hint="Sessions you run on this day show up here with their notes."
          className="py-8"
        />
      ) : (
        <ul className="space-y-2.5">
          {chronological.map((entry) => (
            <SessionRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SessionRow({ entry }: { entry: TimeEntryWithTask }) {
  const start = new Date(entry.start_at);
  const end = entry.end_at ? new Date(entry.end_at) : null;
  const completion = entry.completion_rate;

  return (
    <li className="rounded-xl border border-border bg-background p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.category_color ?? "hsl(var(--muted-foreground))" }}
            />
            <span className="truncate text-sm font-medium text-foreground">{entry.task_title}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 pl-[18px] text-xs text-muted-foreground">
            <span className="tabular-nums">
              {format(start, "HH:mm")} – {end ? format(end, "HH:mm") : "now"}
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">{entry.category_name ?? "Inbox"}</span>
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {formatDurationCompact(entry.duration_seconds ?? 0)}
        </span>
      </div>

      {entry.note ? (
        <p className="mt-2.5 border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
          {entry.note}
        </p>
      ) : null}

      {entry.blocker ? (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{entry.blocker}</span>
        </div>
      ) : null}

      {entry.next_action ? (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <ArrowRight className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{entry.next_action}</span>
        </div>
      ) : null}

      {completion !== null ? (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${Math.min(100, Math.max(0, completion))}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            felt {completion}%
          </span>
        </div>
      ) : null}
    </li>
  );
}
