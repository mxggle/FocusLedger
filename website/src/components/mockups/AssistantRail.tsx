import { CalendarClock, Check, SendHorizonal, Sparkles, SquarePen, X } from "lucide-react";

/** Compact docked assistant rail used inside the Today window mock. */
export function AssistantRail() {
  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-background">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="relative">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles size={13} />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-background bg-primary" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-[12px] font-semibold">Nova</div>
          <div className="truncate text-[9px] text-muted-foreground">claude-opus-4-8 · Claude</div>
        </div>
        <div className="ml-auto flex items-center gap-0.5 text-subtle">
          <SquarePen size={13} />
          <X size={13} />
        </div>
      </div>

      {/* briefing */}
      <div className="mx-2.5 mt-2.5 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
        <CalendarClock size={12} className="shrink-0 text-muted-foreground" />
        <span className="text-[10px] leading-snug text-muted-foreground">On track — 4h 30m of your 5h target planned.</span>
      </div>

      {/* messages */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px]">
            Plan my afternoon.
          </div>
        </div>
        <div className="flex gap-2">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles size={10} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-relaxed">
              You run <span className="font-semibold">1.4×</span> over on design — here are two deep blocks:
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-subtle">2 changes</span>
              <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">
                Apply all
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2 shadow-xs">
              <CalendarClock size={12} className="text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10.5px]">
                  <span className="text-muted-foreground">Reschedule </span>
                  <span className="font-semibold">Onboarding redesign</span>
                </div>
                <div className="text-[9px] text-subtle">14:00 – 16:00</div>
              </div>
              <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">
                Apply
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
              <Check size={11} className="text-success" />
              <span className="flex-1 truncate">Start Draft launch email · 16:15</span>
              <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[8.5px] font-medium text-success-soft-foreground">
                Done
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* composer */}
      <div className="p-2.5">
        <div className="rounded-xl border border-border bg-surface px-2.5 py-2">
          <div className="text-[10.5px] text-subtle">Describe what you want to plan…</div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-medium">Ask</span>
            <span className="ml-auto grid h-5 w-5 place-items-center rounded border border-border-strong text-foreground">
              <SendHorizonal size={11} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
