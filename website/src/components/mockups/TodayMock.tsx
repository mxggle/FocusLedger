import {
  Check,
  ChevronDown,
  Clock,
  ListTodo,
  Maximize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScrollText,
  Sparkles,
  Target,
  Timer,
  Waves,
  Zap
} from "lucide-react";
import { ContentRegion, type MockPlatform } from "./AppWindow";
import { Sidebar } from "./Sidebar";
import { AssistantRail } from "./AssistantRail";
import { cn } from "../../lib/cn";

function PaneHeader({ icon: Icon, title }: { icon: typeof ListTodo; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
      <Icon size={14} className="text-muted-foreground" />
      <span className="text-[12px] font-semibold">{title}</span>
    </div>
  );
}

const catColor: Record<string, string> = {
  Design: "bg-primary",
  Work: "bg-warning",
  Meetings: "bg-accent",
  Writing: "bg-success"
};

const catHex: Record<string, string> = {
  Design: "hsl(var(--primary))",
  Work: "hsl(var(--warning))",
  Meetings: "hsl(var(--accent))",
  Writing: "hsl(var(--success))"
};

/**
 * A task card as the app draws it since 0.8: one accented control, a badge
 * only when the status differs from the default, a category spine inset from
 * the card edge, and elapsed-vs-estimate as a hairline in the bottom padding.
 */
function TaskCard({
  title,
  cat,
  meta,
  status,
  progress = 0
}: {
  title: string;
  cat: keyof typeof catColor;
  meta: string;
  status: "doing" | "todo" | "paused" | "done";
  /** Elapsed vs. estimate, 0–1. */
  progress?: number;
}) {
  const badge = {
    doing: { label: "In progress", cls: "bg-primary-soft text-primary-soft-foreground" },
    todo: null,
    paused: { label: "Paused", cls: "bg-warning-soft text-warning-soft-foreground" },
    done: { label: "Done", cls: "bg-success-soft text-success-soft-foreground" }
  }[status];
  const active = status === "doing";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border py-3 pl-4 pr-3",
        active ? "border-primary/30 bg-primary-soft/30 shadow-card" : "border-border bg-surface shadow-xs"
      )}
    >
      {/* Category spine — a hairline the height of the content, not a slab. */}
      <span
        className="absolute inset-y-3 left-1.5 w-[3px] rounded-full"
        style={{ backgroundColor: catHex[cat] }}
      />

      {/* Progress meter, resting in the card's bottom padding. */}
      {progress > 0 && (
        <span className="absolute bottom-1.5 left-4 right-3 h-[2px] overflow-hidden rounded-full bg-border/70">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </span>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-2.5 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-[13px] font-semibold tracking-tight",
              status === "done" && "text-muted-foreground line-through"
            )}
          >
            {title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", catColor[cat])} />
              {cat}
            </span>
            <span className="font-medium tabular-nums text-foreground/75">{meta}</span>
          </div>
        </div>
        {badge && (
          <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", badge.cls)}>
            {badge.label}
          </span>
        )}
      </div>

      {/* One accented control per card: tinted at rest, solid only on hover. */}
      <div className="mt-2.5 flex items-center gap-1.5">
        {status === "paused" ? (
          <button className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary-soft px-2.5 text-[11px] font-semibold text-primary-soft-foreground">
            <RotateCcw size={11} /> Resume
          </button>
        ) : status === "doing" ? (
          <button className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground">
            <Play size={11} /> Running
          </button>
        ) : status !== "done" ? (
          <button className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary-soft px-2.5 text-[11px] font-semibold text-primary-soft-foreground">
            <Play size={11} /> Start
          </button>
        ) : null}
        {status !== "done" && (
          <button className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground">
            <Check size={11} /> Done
          </button>
        )}
      </div>
    </div>
  );
}

/** The day header's 24h timeline: sessions paint category-colored segments. */
function DayLine() {
  const segments = [
    { left: 35.4, width: 2.1, cls: "bg-accent" }, // 1:1 with Priya
    { left: 38.2, width: 3.3, cls: "bg-success" }, // Draft launch email
    { left: 43.1, width: 3.3, cls: "bg-primary" } // Ship onboarding redesign (live)
  ];
  const nowPct = 46.4;
  return (
    <div aria-hidden className="relative mt-2.5 h-1.5">
      <div className="absolute inset-0 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/50">
        <div className="absolute inset-y-0 left-0 bg-foreground/[0.05]" style={{ width: `${nowPct}%` }} />
        {[25, 50, 75].map((tick) => (
          <span key={tick} className="absolute inset-y-0 w-px bg-border-strong/60" style={{ left: `${tick}%` }} />
        ))}
        {segments.map((s) => (
          <span
            key={s.left}
            className={cn("absolute inset-y-0 rounded-full", s.cls)}
            style={{ left: `${s.left}%`, width: `${s.width}%` }}
          />
        ))}
      </div>
      <span
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary shadow-sm"
        style={{ left: `${nowPct}%` }}
      />
    </div>
  );
}

/** The real Today screen: day header over Tasks │ Focus │ Log panes. */
export function TodayMock({ platform = "mac" }: { platform?: MockPlatform }) {
  const C = 2 * Math.PI * 44;
  const progress = 0.4;
  return (
    <div className="relative flex h-[480px] text-foreground">
      <Sidebar className="hidden md:flex" platform={platform} />

      <ContentRegion platform={platform} className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Day header — date, live clock, and the day line */}
        <div className="border-b border-border px-4 pb-3 pt-2.5">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold leading-tight tracking-tight">
                <span className="text-gradient">Friday</span>
                <span className="font-semibold text-muted-foreground">, July 3</span>
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">Good morning — make the hours count.</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-[15px] font-semibold leading-none tabular-nums">11:08</div>
              <div className="mt-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">2h 6m focused</div>
            </div>
          </div>
          <DayLine />
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Tasks pane */}
          <div className="flex min-w-0 flex-1 flex-col border-r border-border">
            <PaneHeader icon={ListTodo} title="Tasks" />
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3.5">
              <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                  Add to today
                  <Sparkles size={10} className="text-primary" />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 truncate rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-muted-foreground">
                    review the deck tomorrow, high prio, ~30m
                  </div>
                  <button className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground">
                    <Plus size={12} /> Add
                  </button>
                </div>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Today</div>
              <div className="flex flex-col gap-2">
                <TaskCard title="Ship onboarding redesign" cat="Design" meta="48m / 2h" status="doing" progress={0.4} />
                <TaskCard title="Review Q3 metrics deck" cat="Work" meta="45 min" status="todo" />
                <TaskCard title="Draft launch email" cat="Writing" meta="48m / 1h" status="paused" progress={0.8} />
                <TaskCard title="1:1 with Priya" cat="Meetings" meta="30m / 30m" status="done" />
              </div>
            </div>
          </div>

          {/* Focus pane */}
          <div className="hidden w-[268px] shrink-0 flex-col border-r border-border lg:flex">
            <PaneHeader icon={Timer} title="Focus" />
            <div className="flex min-h-0 flex-1 flex-col p-3.5">
              <div className="flex flex-1 flex-col rounded-2xl border border-primary/30 bg-surface shadow-card">
                <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-b from-primary/10 to-transparent px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary-soft-foreground">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    Current Focus
                  </div>
                  <div className="flex items-center gap-1 text-subtle">
                    <Waves size={13} />
                    <Maximize2 size={13} />
                  </div>
                </div>
                <div className="px-3.5 text-[13px] font-semibold">Ship onboarding redesign</div>
    
                <div className="flex flex-1 flex-col items-center justify-center">
                  <div className="relative grid h-[150px] w-[150px] place-items-center">
                    <svg className="absolute -rotate-90" viewBox="0 0 120 120" width="150" height="150">
                      <circle cx="60" cy="60" r="44" fill="none" stroke="hsl(var(--primary) / 0.15)" strokeWidth="5" />
                      <circle
                        cx="60"
                        cy="60"
                        r="44"
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={C}
                        strokeDashoffset={C * (1 - progress)}
                      />
                    </svg>
                    <div className="flex flex-col items-center">
                      <div className="font-mono text-[26px] font-semibold leading-none tabular-nums">48:12</div>
                      <div className="mt-1 text-[10px] text-muted-foreground">120 min · 40%</div>
                    </div>
                  </div>
                </div>
    
                <div className="flex items-center justify-center gap-2 border-t border-primary/10 px-3.5 py-3">
                  <button className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 py-2 text-[12px] font-semibold">
                    <Pause size={13} /> Pause
                  </button>
                  <button className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground shadow-sm">
                    <Check size={13} /> Done
                  </button>
                </div>
              </div>
            </div>
          </div>
    
          {/* Log pane */}
          <div className="hidden w-[200px] shrink-0 flex-col 2xl:flex">
            <PaneHeader icon={ScrollText} title="Log" />
            <div className="border-b border-border bg-gradient-to-b from-primary-soft/40 to-surface/95 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-primary">
                  <Target size={13} />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Today</span>
                <div className="ml-auto flex items-center gap-1 text-[11px] font-semibold">
                  87%
                  <ChevronDown size={12} className="text-subtle" />
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary" style={{ width: "87%" }} />
              </div>
              <div className="mt-2.5 flex gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[10px] font-medium ring-1 ring-border">
                  <Zap size={11} className="text-primary" /> 4h 22m
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[10px] font-medium ring-1 ring-border">
                  <Clock size={11} className="text-success" /> 3 done
                </span>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3.5">
              {[
                { t: "08:30", title: "1:1 with Priya", cat: "Meetings", dur: "30m" },
                { t: "09:10", title: "Draft launch email", cat: "Writing", dur: "48m" },
                { t: "10:20", title: "Ship onboarding redesign", cat: "Design", dur: "48m", live: true }
              ].map((e) => (
                <div key={e.t} className="flex gap-2.5">
                  <div className="w-9 shrink-0 pt-0.5 text-right font-mono text-[10px] tabular-nums text-subtle">{e.t}</div>
                  <div className="relative flex flex-col items-center">
                    <span className={cn("mt-1 h-2 w-2 rounded-full", catColor[e.cat])} />
                    <span className="mt-0.5 w-px flex-1 bg-border" />
                  </div>
                  <div className="flex-1 rounded-lg border border-border bg-surface p-2">
                    <div className="truncate text-[11px] font-medium">{e.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={cn("h-1.5 w-1.5 rounded-full", catColor[e.cat])} />
                      {e.cat} · {e.live ? "now" : e.dur}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Assistant dock — reflows in like the real app */}
      <div className="hidden w-[280px] shrink-0 xl:flex">
        <AssistantRail />
      </div>
      </ContentRegion>

      {/* Floating launcher — shown when the dock is closed */}
      <button
        aria-hidden
        className="absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-pop animate-pulse-ring xl:hidden"
      >
        <Sparkles size={18} />
      </button>
    </div>
  );
}
