/**
 * Circular ring framing the focus timer. With an estimate it shows a track +
 * animated progress arc and a leading "now" marker; without one it's just a
 * faint decorative frame (a full muted "0% progress" ring reads as stuck/odd).
 *
 * Resolution-independent: everything is in a 0–100 viewBox, so the ring scales
 * to whatever size its container is given — small card or full-screen zen.
 */
export function FocusRing({
  pct,
  overrun,
  hasEstimate,
  isRunning,
  reduce
}: {
  pct: number;
  overrun: boolean;
  hasEstimate: boolean;
  isRunning: boolean;
  reduce: boolean;
}) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clampedPct / 100);
  const stroke = overrun ? "hsl(var(--warning))" : "url(#focusRingStroke)";
  const accent = overrun ? "hsl(var(--warning))" : "hsl(var(--primary))";
  // Only animate a live, in-progress arc; a paused or overrun ring stays still.
  const animate = isRunning && !reduce;
  const showHead = animate && !overrun && clampedPct > 0 && clampedPct < 100;
  // Angle of the arc tip, measured clockwise from 3 o'clock in the (already
  // -90°-rotated) svg space — so the marker sits exactly where the arc ends.
  const headAngle = (clampedPct / 100) * 360;

  if (!hasEstimate) {
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="3"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full -rotate-90 overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id="focusRingStroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--primary) / 0.65)" />
        </linearGradient>
        {/* Soft bloom so the live arc glows instead of sitting flat. */}
        <filter id="focusRingGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="1.6"
            floodColor={accent}
            floodOpacity={animate ? "0.45" : "0"}
          />
        </filter>
      </defs>
      {/* Track */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth="5"
      />
      {/* Progress */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={stroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        filter="url(#focusRingGlow)"
        className="transition-[stroke-dashoffset] duration-500 ease-out"
      />
      {/* Leading "now" marker: a slider-style knob at the arc tip with a soft
          breathing glow. Sits on a surface-colored disc so it lifts cleanly
          off the arc instead of merging into it. */}
      {showHead ? (
        <g
          transform={`rotate(${headAngle} 50 50)`}
          className="transition-transform duration-500 ease-out"
        >
          {/* Breathing glow */}
          <circle
            cx={50 + radius}
            cy="50"
            r="4"
            fill={accent}
            className="motion-safe:animate-[focus-head-glow_2.6s_ease-in-out_infinite]"
          />
          {/* Knob: surface ring + accent core */}
          <circle cx={50 + radius} cy="50" r="4" fill="hsl(var(--surface))" />
          <circle cx={50 + radius} cy="50" r="2.4" fill={accent} />
        </g>
      ) : null}
    </svg>
  );
}
