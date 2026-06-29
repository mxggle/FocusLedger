import { CheckCircle2, Clock, PieChart, RefreshCw, Sparkles, Target } from "lucide-react";
import { cn } from "../../lib/cn";

function HeroStat({
  icon: Icon,
  value,
  label,
  tone,
  sub
}: {
  icon: typeof Clock;
  value: string;
  label: string;
  tone: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-muted">
        <Icon size={16} className={tone} />
      </span>
      <div className={cn("mt-3 text-[26px] font-bold leading-none tabular-nums", tone)}>{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
      {sub && <div className="text-[10px] text-subtle">{sub}</div>}
    </div>
  );
}

const SLICES = [
  { cat: "Design", pct: 50, dur: "2h 10m", tone: "hsl(var(--primary))" },
  { cat: "Meetings", pct: 21, dur: "55m", tone: "hsl(var(--accent))" },
  { cat: "Writing", pct: 18, dur: "48m", tone: "hsl(var(--success))" },
  { cat: "Work", pct: 11, dur: "29m", tone: "hsl(var(--warning))" }
];

/** The real My Day review: hero stats, AI day story, donut + estimate vs reality. */
export function MyDayMock() {
  const r = 16;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex h-[480px] flex-col gap-3.5 overflow-hidden bg-background p-5 text-foreground">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">My Day</span>
        <span className="ml-1 text-[15px] font-semibold">Day in review</span>
        <span className="ml-auto rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">Monday · Jun 29</span>
      </div>

      {/* hero stat band */}
      <div className="grid grid-cols-3 gap-3">
        <HeroStat icon={Clock} value="4h 22m" label="focused" tone="text-primary" />
        <HeroStat icon={CheckCircle2} value="3" label="tasks done" sub="1 dropped" tone="text-foreground" />
        <HeroStat icon={Target} value="+34m" label="over plan" tone="text-warning-soft-foreground" />
      </div>

      {/* day story */}
      <div className="rounded-2xl border border-primary/20 bg-primary-soft/40 p-4">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-primary" />
          <span className="text-[12px] font-semibold text-primary-soft-foreground">Story of your day</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-subtle">
            <RefreshCw size={10} /> Update
          </span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-foreground/90">
          A focused morning — the onboarding redesign took the deep block it deserved, though it ran ~30m past your
          estimate. Meetings stayed contained. One thing for tomorrow: protect the first hour before the 1:1.
        </p>
      </div>

      {/* timeline */}
      <div className="rounded-2xl border border-border bg-surface p-3.5">
        <div className="text-[11px] font-semibold">Day timeline</div>
        <div className="relative mt-2 h-9 overflow-hidden rounded-lg bg-muted/60">
          {[
            { l: 8, w: 14, c: "hsl(var(--accent))" },
            { l: 24, w: 30, c: "hsl(var(--success))" },
            { l: 58, w: 34, c: "hsl(var(--primary))" }
          ].map((b, i) => (
            <div
              key={i}
              className="absolute inset-y-1 rounded-md"
              style={{ left: `${b.l}%`, width: `${b.w}%`, background: b.c }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-subtle">
          <span>8a</span>
          <span>10a</span>
          <span>12p</span>
          <span>2p</span>
          <span>4p</span>
          <span>6p</span>
        </div>
      </div>

      {/* donut + estimate */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            <PieChart size={12} className="text-muted-foreground" /> Where the time went
          </div>
          <div className="mt-2 flex items-center gap-3">
            <svg viewBox="0 0 42 42" className="h-[68px] w-[68px] -rotate-90">
              <circle cx="21" cy="21" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
              {SLICES.map((s) => {
                const len = (s.pct / 100) * circ;
                const el = (
                  <circle
                    key={s.cat}
                    cx="21"
                    cy="21"
                    r={r}
                    fill="none"
                    stroke={s.tone}
                    strokeWidth="5"
                    strokeDasharray={`${len} ${circ - len}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })}
            </svg>
            <div className="flex flex-col gap-1">
              {SLICES.map((s) => (
                <div key={s.cat} className="flex items-center gap-1.5 text-[10px]">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.tone }} />
                  <span className="w-14 text-muted-foreground">{s.cat}</span>
                  <span className="tabular-nums text-subtle">{s.dur}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-3.5">
          <div className="text-[11px] font-semibold">Estimate vs reality</div>
          <div className="mt-3 flex flex-col gap-2.5">
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                <span>Planned</span>
                <span className="tabular-nums">3h 48m</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: "78%" }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                <span>Actual</span>
                <span className="tabular-nums">4h 22m</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: "90%" }} />
              </div>
            </div>
          </div>
          <div className="mt-3 text-[10px] text-warning-soft-foreground">+34m over plan</div>
        </div>
      </div>
    </div>
  );
}
