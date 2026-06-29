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

function TaskCard({
  title,
  cat,
  meta,
  status
}: {
  title: string;
  cat: keyof typeof catColor;
  meta: string;
  status: "doing" | "todo" | "paused" | "done";
}) {
  const badge = {
    doing: { label: "In progress", cls: "bg-primary-soft text-primary-soft-foreground" },
    todo: { label: "To do", cls: "bg-muted text-muted-foreground" },
    paused: { label: "Paused", cls: "bg-warning-soft text-warning-soft-foreground" },
    done: { label: "Done", cls: "bg-success-soft text-success-soft-foreground" }
  }[status];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-surface p-3 pl-3.5 shadow-card",
        status === "doing" ? "border-primary/40 ring-1 ring-inset ring-primary/10" : "border-border"
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", catColor[cat])} />
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-[13px] font-semibold", status === "done" && "text-subtle line-through")}>
          {title}
        </span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", badge.cls)}>{badge.label}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", catColor[cat])} />
        {cat}
        <span className="text-border-strong">·</span>
        {meta}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        {status === "paused" ? (
          <button className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
            <RotateCcw size={11} /> Resume
          </button>
        ) : status === "doing" ? (
          <button className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary-soft-foreground">
            <Play size={11} /> Running
          </button>
        ) : status !== "done" ? (
          <button className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
            <Play size={11} /> Start
          </button>
        ) : null}
        {status !== "done" && (
          <button className="inline-flex items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-[11px] font-medium text-foreground">
            <Check size={11} /> Done
          </button>
        )}
      </div>
    </div>
  );
}

/** The real Today screen: Tasks │ Focus │ Log — three collapsible panes. */
export function TodayMock() {
  const C = 2 * Math.PI * 44;
  const progress = 0.4;
  return (
    <div className="relative flex h-[480px] bg-surface text-foreground">
      <Sidebar className="hidden md:flex" />

      {/* Tasks pane */}
      <div className="flex min-w-0 flex-1 flex-col border-r border-border">
        <PaneHeader icon={ListTodo} title="Tasks" />
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3.5">
          <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Add to today</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-subtle">
                What needs to get done?
              </div>
              <button className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground">
                <Plus size={12} /> Add
              </button>
            </div>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Today</div>
          <div className="flex flex-col gap-2">
            <TaskCard title="Ship onboarding redesign" cat="Design" meta="48m / 2h" status="doing" />
            <TaskCard title="Review Q3 metrics deck" cat="Work" meta="45 min" status="todo" />
            <TaskCard title="Draft launch email" cat="Writing" meta="1h" status="paused" />
            <TaskCard title="1:1 with Priya" cat="Meetings" meta="30 min" status="done" />
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

      {/* Assistant dock — reflows in like the real app */}
      <div className="hidden w-[280px] shrink-0 xl:flex">
        <AssistantRail />
      </div>

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
