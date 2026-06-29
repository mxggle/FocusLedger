import {
  Bell,
  CalendarClock,
  Check,
  Eraser,
  History,
  Inbox,
  Pencil,
  RotateCcw,
  SendHorizonal,
  Sparkles,
  SquarePen,
  X
} from "lucide-react";
import { cn } from "../../lib/cn";

function HeaderIcon({ icon: Icon }: { icon: typeof X }) {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      <Icon size={14} />
    </span>
  );
}

function PendingCard({
  icon: Icon,
  action,
  target,
  detail,
  destructive
}: {
  icon: typeof Check;
  action: string;
  target: string;
  detail: string;
  destructive?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2.5 shadow-xs">
      <Icon size={14} className={destructive ? "text-destructive-soft-foreground" : "text-primary"} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px]">
          <span className="text-muted-foreground">{action} </span>
          <span className="font-semibold">{target}</span>
        </div>
        <div className="truncate text-[10.5px] text-subtle">{detail}</div>
      </div>
      <span className="grid h-6 w-6 place-items-center rounded text-subtle">
        <X size={12} />
      </span>
      <button
        className={cn(
          "rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
          destructive ? "bg-destructive text-primary-foreground" : "bg-primary text-primary-foreground"
        )}
      >
        Apply
      </button>
    </div>
  );
}

/** Faithful docked assistant rail: briefing → conversation → propose-then-confirm → composer. */
export function AssistantMock() {
  return (
    <div className="flex h-[520px] flex-col bg-background text-foreground">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="relative">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles size={15} />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-[13px] font-semibold">Nova</div>
          <div className="truncate text-[10px] text-muted-foreground">claude-opus-4-8 · Claude (Anthropic)</div>
        </div>
        <div className="ml-auto flex items-center">
          <HeaderIcon icon={SquarePen} />
          <HeaderIcon icon={History} />
          <HeaderIcon icon={Eraser} />
          <HeaderIcon icon={X} />
        </div>
      </div>

      {/* day briefing banner — overcommitted */}
      <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2">
        <CalendarClock size={14} className="shrink-0 text-warning-soft-foreground" />
        <span className="text-[11px] leading-snug text-warning-soft-foreground">
          Overcommitted — 6h scheduled vs your 5h target (over by 1h).
        </span>
        <button className="ml-auto shrink-0 rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-semibold text-primary">
          Trim my day
        </button>
      </div>

      {/* messages */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-3.5">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px]">
            Plan my afternoon and reschedule what won't fit.
          </div>
        </div>

        <div className="flex gap-2.5">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles size={11} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] leading-relaxed">
              You run <span className="font-semibold">1.4×</span> over on design work, so I kept the afternoon to two deep
              blocks and moved the rest to tomorrow. Here's the plan:
            </p>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">3 proposed changes</span>
              <button className="rounded-full bg-primary px-2.5 py-1 text-[10.5px] font-semibold text-primary-foreground">
                Apply all (3)
              </button>
            </div>

            <div className="mt-2 flex flex-col gap-1.5">
              <PendingCard icon={CalendarClock} action="Reschedule" target="Onboarding redesign" detail="14:00 – 16:00" />
              <PendingCard icon={Check} action="Start" target="Draft launch email" detail="at 16:15 · Writing" />
              <PendingCard icon={Inbox} action="Move to backlog" target="Metrics deck" detail="defer to tomorrow" />
            </div>

            {/* a resolved card */}
            <div className="mt-2 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
              <Pencil size={12} className="text-subtle" />
              <span className="flex-1 truncate">Updated estimate · Onboarding redesign</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success-soft-foreground">
                <Check size={10} /> Done
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-subtle">
                <RotateCcw size={10} /> Revert
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* composer */}
      <div className="p-3">
        <div className="rounded-xl border border-border bg-surface px-3 py-2.5 focus-within:border-primary">
          <div className="text-[12px] text-subtle">Describe what you want to plan…</div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10.5px] font-medium">
              <Bell size={12} className="text-primary" /> Ask
              <span className="text-subtle">· confirms each change</span>
            </span>
            <span className="ml-auto text-[10px] text-subtle">
              <kbd className="rounded bg-muted px-1 py-0.5 font-sans">↵</kbd> to send
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-md border border-border-strong text-foreground">
              <SendHorizonal size={13} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
