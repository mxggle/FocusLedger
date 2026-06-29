/**
 * The rest countdown ring. Where the focus ring *fills* as effort accumulates,
 * this one *drains* — the arc shrinks toward empty as the break runs down,
 * reading as "winding down" rather than "pushing on". Thinner and softer than
 * the focus ring, with no leading marker, so it stays calm. Resolution
 * independent (0–100 viewBox); inherits its color from `--focus-accent`.
 */
export function RestRing({
  remainingPct,
  done,
  reduce
}: {
  /** Portion of the planned break still remaining, 0–100. */
  remainingPct: number;
  /** True once the planned time is spent (arc empty, track gently glows). */
  done: boolean;
  reduce: boolean;
}) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, remainingPct));
  const offset = circumference * (1 - clamped / 100);

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="restRingStroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--focus-accent))" />
          <stop offset="100%" stopColor="hsl(var(--focus-accent) / 0.55)" />
        </linearGradient>
      </defs>
      {/* Track — a faint halo; brightens softly when the time is up. */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={`hsl(var(--focus-accent) / ${done ? 0.32 : 0.16})`}
        strokeWidth="3.5"
        className={done && !reduce ? "motion-safe:animate-[breathe_6s_ease-in-out_infinite]" : ""}
        style={{ transition: "stroke 0.6s ease-out" }}
      />
      {/* Remaining arc — shrinks toward empty as the break runs down. */}
      {!done ? (
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="url(#restRingStroke)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      ) : null}
    </svg>
  );
}
