import { Hourglass } from "lucide-react";
import { cn } from "../../lib/cn";

/** "Memento Mori" — your life in weeks, heat-mapped by tracked focus. */
export function LifeMock() {
  const cols = 30;
  const rows = 12;
  const cells = rows * cols;
  const livedFrac = 0.46;
  const intensity = (i: number) => {
    if (i >= cells * livedFrac) return -1; // future
    const n = (i * 53 + 11) % 9;
    if (n === 0) return 3;
    if (n < 2) return 2;
    if (n < 5) return 1;
    return 0;
  };
  const lived = ["bg-primary/30", "bg-primary/55", "bg-primary/80", "bg-primary"];

  return (
    <div className="flex h-[480px] bg-background text-foreground">
      {/* grid */}
      <div className="flex min-w-0 flex-1 flex-col border-r border-border p-5">
        <div className="flex items-center gap-2">
          <Hourglass size={14} className="text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Memento Mori</span>
        </div>
        <div className="mt-1 text-[15px] font-semibold">Your life in weeks</div>
        <div className="text-[11px] text-subtle">Each square is one week · shaded by tracked focus</div>

        <div
          className="mt-5 grid flex-1 content-start gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cells }).map((_, i) => {
            const v = intensity(i);
            const isNow = i === Math.floor(cells * livedFrac) - 1;
            return (
              <div
                key={i}
                className={cn(
                  "aspect-square rounded-[2px]",
                  isNow ? "bg-foreground ring-1 ring-primary" : v === -1 ? "bg-muted" : lived[v]
                )}
              />
            );
          })}
        </div>
      </div>

      {/* right aside */}
      <div className="hidden w-[230px] shrink-0 flex-col gap-3 p-5 lg:flex">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { k: "Lived", v: "1,476" },
              { k: "Left", v: "2,684", accent: true },
              { k: "Spent", v: "36%" }
            ].map((s) => (
              <div key={s.k}>
                <div className={cn("text-[18px] font-bold leading-none", s.accent ? "text-primary" : "")}>{s.v}</div>
                <div className="mt-1 text-[9px] uppercase tracking-wide text-subtle">{s.k}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: "36%" }} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            You're 28 — about <span className="font-semibold text-foreground">51</span> years left. Don't waste the
            squares.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-subtle">This week</div>
          <div className="mt-1 text-[12px] font-medium">Week 1,476 · age 28</div>
          <div className="mt-2 text-[18px] font-bold text-primary">6h 12m</div>
          <div className="text-[10px] text-subtle">focus logged · 9 sessions</div>
        </div>

        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1.5 text-[9px] text-subtle">
          {[
            { c: "bg-primary", l: "Focused" },
            { c: "bg-primary/30", l: "Lived" },
            { c: "bg-foreground", l: "This week" },
            { c: "bg-muted", l: "To come" }
          ].map((x) => (
            <span key={x.l} className="inline-flex items-center gap-1">
              <span className={cn("h-2.5 w-2.5 rounded-[2px]", x.c)} /> {x.l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
