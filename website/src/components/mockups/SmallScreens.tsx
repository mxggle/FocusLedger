import { CalendarClock, CalendarCheck, CalendarDays, Inbox, Package, Pencil, Play } from "lucide-react";
import { cn } from "../../lib/cn";

function Head({ icon: Icon, eyebrow, title }: { icon: typeof Inbox; eyebrow: string; title: string }) {
  return (
    <div className="border-b border-border px-5 py-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
        <Icon size={12} className="text-primary" /> {eyebrow}
      </div>
      <div className="mt-0.5 text-[15px] font-semibold">{title}</div>
    </div>
  );
}

const dot: Record<string, string> = {
  Design: "bg-primary",
  Work: "bg-warning",
  Study: "bg-accent",
  Writing: "bg-success",
  Health: "bg-destructive"
};

/** Plan — recurring task templates. */
export function PlanMock() {
  const items = [
    { title: "Japanese study", time: "07:30 → 08:15", rep: "Every day", cat: "Study", on: true },
    { title: "Deep work block", time: "09:30 → 11:30", rep: "Weekdays", cat: "Design", on: true },
    { title: "Weekly review", time: "Anytime", rep: "Fri", cat: "Work", on: false }
  ];
  return (
    <div className="flex h-[300px] flex-col bg-background text-foreground">
      <Head icon={CalendarClock} eyebrow="Plan" title="Recurring tasks" />
      <div className="flex flex-col gap-2 p-4">
        <div className="rounded-lg border border-dashed border-border-strong px-3 py-2 text-[11px] text-subtle">
          + New plan item — title, start, end, repeat…
        </div>
        {items.map((p) => (
          <div
            key={p.title}
            className={cn(
              "relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface p-2.5 pl-3.5 shadow-card",
              !p.on && "opacity-70"
            )}
          >
            <span className={cn("absolute inset-y-0 left-0 w-1", dot[p.cat])} />
            <div className="rounded-md bg-muted px-2 py-1 text-center font-mono text-[9px] leading-tight text-muted-foreground ring-1 ring-border">
              {p.time.split(" → ").map((t) => (
                <div key={t}>{t}</div>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[12px] font-semibold">{p.title}</span>
                <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[9px] font-medium text-primary-soft-foreground">
                  {p.rep}
                </span>
                {!p.on && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">Off</span>}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className={cn("h-1.5 w-1.5 rounded-full", dot[p.cat])} /> {p.cat}
              </div>
            </div>
            <div
              className={cn(
                "flex h-4 w-7 items-center rounded-full px-0.5",
                p.on ? "justify-end bg-primary" : "justify-start bg-muted"
              )}
            >
              <span className="h-3 w-3 rounded-full bg-white shadow-sm" />
            </div>
            <Pencil size={12} className="text-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Backlog — captured + scheduled work. */
export function BacklogMock() {
  return (
    <div className="flex h-[300px] flex-col bg-background text-foreground">
      <Head icon={Package} eyebrow="Backlog" title="Captured & scheduled work" />
      <div className="flex flex-col gap-3 p-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-subtle">
            Scheduled <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">2</span>
          </div>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {[
              { t: "Prep demo for Friday", cat: "Work", date: "Jul 3" },
              { t: "Dentist appointment", cat: "Health", date: "Jul 5" }
            ].map((b) => (
              <div key={b.t} className="relative overflow-hidden rounded-lg border border-border bg-surface px-3 py-2 pl-3.5 shadow-card">
                <span className={cn("absolute inset-y-0 left-0 w-1", dot[b.cat])} />
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium">{b.t}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <CalendarDays size={10} /> {b.date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-subtle">
            Backlog <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">1</span>
          </div>
          <div className="mt-1.5 relative overflow-hidden rounded-lg border border-border bg-surface px-3 py-2 pl-3.5 shadow-card">
            <span className={cn("absolute inset-y-0 left-0 w-1", dot.Writing)} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium">Rewrite the about page</span>
              <div className="flex items-center gap-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">
                  <CalendarCheck size={9} /> Today
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
                  <CalendarClock size={9} /> Next week
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
                  <Play size={9} /> Start
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** History — last 7 days. */
export function HistoryMock() {
  const days = [
    { d: "Mon", h: "3h 10m", n: 4 },
    { d: "Tue", h: "4h 20m", n: 5, sel: true },
    { d: "Wed", h: "2h 05m", n: 3 },
    { d: "Thu", h: "5h 00m", n: 6 },
    { d: "Fri", h: "3h 40m", n: 4 },
    { d: "Sat", h: "1h 10m", n: 1 },
    { d: "Sun", h: "0h 30m", n: 1 }
  ];
  return (
    <div className="flex h-[300px] flex-col bg-background text-foreground">
      <Head icon={CalendarDays} eyebrow="History" title="Last 7 days" />
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => (
            <div
              key={d.d}
              className={cn(
                "rounded-lg border p-1.5 text-center",
                d.sel ? "border-primary/40 bg-primary-soft shadow-md" : "border-border bg-surface"
              )}
            >
              <div className="text-[9px] text-subtle">{d.d}</div>
              <div className="mt-0.5 text-[10px] font-semibold tabular-nums">{d.h}</div>
              <div className="text-[8px] text-subtle">{d.n} done</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
            <div className="text-[10px] font-semibold">Tue · Jun 30</div>
            <div className="mt-2 flex flex-col gap-1.5 text-[10px]">
              {[
                ["Total focus", "4h 20m"],
                ["Completed", "5"],
                ["Time drift", "+18m"]
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
            <div className="text-[10px] font-semibold">Time Records</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {[
                { t: "Ship onboarding redesign", c: "Design", d: "2h 10m" },
                { t: "Standup", c: "Work", d: "20m" },
                { t: "Draft launch email", c: "Writing", d: "1h 05m" }
              ].map((e) => (
                <div key={e.t} className="flex items-center gap-1.5 text-[10px]">
                  <span className={cn("h-1.5 w-1.5 rounded-full", dot[e.c])} />
                  <span className="flex-1 truncate text-foreground/90">{e.t}</span>
                  <span className="tabular-nums text-subtle">{e.d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
