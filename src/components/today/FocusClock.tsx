import type { ReactNode } from "react";
import { formatDurationCompact, formatTimer } from "../../utils/duration";
import { cn } from "../../utils/cn";
import { normalizeClockId } from "./clocks/registry";
import { FocusRing } from "./FocusRing";

/**
 * The face of a focus session: digits plus a progress treatment, in one of the
 * user-selectable styles from `clocks/registry`. Fills a square container that
 * must have `container-type: inline-size` — every size in here is in `cqw`, so
 * the same component serves the side-pane card and the full-screen zen stage.
 *
 * Faces own their whole composition (frame + digits + subline) because each
 * style wants different typography and hierarchy; the parents only supply the
 * session numbers and keep the `role="progressbar"` semantics on the wrapper.
 */
export function FocusClock({
  clock,
  ...face
}: FaceProps & {
  /** Raw `focusClockStyle` setting; unknown values fall back to the ring. */
  clock: string;
}) {
  switch (normalizeClockId(clock)) {
    case "countdown":
      return <CountdownFace {...face} />;
    case "dial":
      return <DialFace {...face} />;
    case "minimal":
      return <MinimalFace {...face} />;
    default:
      return <RingFace {...face} />;
  }
}

type FaceProps = {
  elapsedSeconds: number;
  estimateSeconds: number;
  hasEstimate: boolean;
  /** Unclamped percentage of the estimate; may exceed 100 when overrun. */
  progress: number;
  overrun: boolean;
  isRunning: boolean;
  reduce: boolean;
};

/* ── Shared pieces (also used by RestClock's faces) ────────────────────── */

/** Column centered over the face; spacing scales with the container. */
export function CenterStack({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center px-4",
        className
      )}
      style={{ gap: "clamp(4px, 2cqw, 10px)" }}
    >
      {children}
    </div>
  );
}

const DIGIT_SIZES = {
  /** Inside a ring/dial frame — must clear the circle. */
  framed: "clamp(18px, 12.5cqw, 50px)",
  /** Tighter, the dial's ticks sit closer in than the ring. */
  dial: "clamp(16px, 11cqw, 44px)",
  /** Typographic hero in a wide `type` container — full-screen-timer scale. */
  hero: "clamp(28px, 21cqw, 152px)"
} as const;

export function Digits({
  children,
  overrun,
  size = "framed"
}: {
  children: ReactNode;
  overrun: boolean;
  size?: keyof typeof DIGIT_SIZES;
}) {
  return (
    <div
      className={`font-mono font-bold tabular-nums leading-none transition-colors ${
        overrun ? "text-warning" : "text-foreground"
      }`}
      style={{ fontSize: DIGIT_SIZES[size] }}
    >
      {children}
    </div>
  );
}

/** Framed faces measure against a circle; hero scales with a wide container. */
const SUBLINE_SIZES = {
  framed: "clamp(11px, 4.6cqw, 14px)",
  hero: "clamp(12px, 2.2cqw, 19px)"
} as const;

export function SubLine({
  children,
  size = "framed"
}: {
  children: ReactNode;
  size?: keyof typeof SUBLINE_SIZES;
}) {
  return (
    <span
      className="font-medium text-muted-foreground tabular-nums"
      style={{ fontSize: SUBLINE_SIZES[size] }}
    >
      {children}
    </span>
  );
}

function OverBadge({
  overSeconds,
  size = "framed"
}: {
  overSeconds: number;
  size?: keyof typeof SUBLINE_SIZES;
}) {
  return (
    <span
      className="rounded-full bg-warning-soft px-2.5 py-0.5 font-semibold text-warning-soft-foreground ring-1 ring-inset ring-warning/20"
      style={{ fontSize: SUBLINE_SIZES[size] }}
    >
      Over by {formatDurationCompact(overSeconds)}
    </span>
  );
}

/* ── Faces ─────────────────────────────────────────────────────────────── */

/** The classic: count-up digits inside the filling progress ring. */
function RingFace(p: FaceProps) {
  const pct = Math.round(Math.min(p.progress, 100));
  return (
    <>
      <FocusRing
        pct={Math.min(p.progress, 100)}
        overrun={p.overrun}
        hasEstimate={p.hasEstimate}
        isRunning={p.isRunning}
        reduce={p.reduce}
      />
      <CenterStack>
        <Digits overrun={p.overrun}>{formatTimer(p.elapsedSeconds)}</Digits>
        {p.overrun ? (
          <OverBadge overSeconds={p.elapsedSeconds - p.estimateSeconds} />
        ) : (
          <SubLine>
            {p.hasEstimate
              ? `${Math.round(p.estimateSeconds / 60)} min · ${pct}%`
              : formatDurationCompact(p.elapsedSeconds)}
          </SubLine>
        )}
      </CenterStack>
    </>
  );
}

/**
 * Pomodoro-style: remaining time inside a ring that drains as the estimate is
 * spent. Overrun flips the digits to a warning "+overage" count-up, which
 * already carries the message, so no extra badge. Without an estimate there is
 * nothing to count down from — behave exactly like the ring.
 */
function CountdownFace(p: FaceProps) {
  if (!p.hasEstimate) return <RingFace {...p} />;
  const leftPct = Math.max(0, Math.min(100, 100 - p.progress));
  const remaining = Math.max(0, p.estimateSeconds - p.elapsedSeconds);
  const estimateMinutes = Math.round(p.estimateSeconds / 60);
  return (
    <>
      <FocusRing
        pct={leftPct}
        overrun={p.overrun}
        hasEstimate
        isRunning={p.isRunning}
        reduce={p.reduce}
      />
      <CenterStack>
        <Digits overrun={p.overrun}>
          {p.overrun
            ? `+${formatTimer(p.elapsedSeconds - p.estimateSeconds)}`
            : formatTimer(remaining)}
        </Digits>
        <SubLine>
          {p.overrun
            ? `Planned ${estimateMinutes} min`
            : `${estimateMinutes} min · ${Math.round(leftPct)}% left`}
        </SubLine>
      </CenterStack>
    </>
  );
}

/**
 * Watch face: 60 ticks that light up clockwise from 12 as the estimate is
 * spent (all of them, in warning, once overrun). Without an estimate the ticks
 * become a literal minute hand — one lights per elapsed minute of the current
 * hour — so the face stays alive instead of freezing at zero.
 */
function DialFace(p: FaceProps) {
  const litCount = p.hasEstimate
    ? p.overrun
      ? 60
      : Math.floor((Math.min(p.progress, 100) / 100) * 60)
    : Math.floor(p.elapsedSeconds / 60) % 60;
  const accent = p.overrun ? "hsl(var(--warning))" : "hsl(var(--focus-accent))";
  const pct = Math.round(Math.min(p.progress, 100));
  return (
    <>
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        {Array.from({ length: 60 }, (_, i) => {
          const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const major = i % 5 === 0;
          const rOuter = 47;
          const rInner = major ? 40.5 : 43;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          return (
            <line
              key={i}
              x1={(50 + cos * rInner).toFixed(2)}
              y1={(50 + sin * rInner).toFixed(2)}
              x2={(50 + cos * rOuter).toFixed(2)}
              y2={(50 + sin * rOuter).toFixed(2)}
              stroke={i < litCount ? accent : "hsl(var(--focus-accent) / 0.16)"}
              strokeWidth={major ? 2 : 1.4}
              strokeLinecap="round"
              className="transition-colors duration-500"
            />
          );
        })}
      </svg>
      <CenterStack>
        <Digits overrun={p.overrun} size="dial">
          {formatTimer(p.elapsedSeconds)}
        </Digits>
        {p.overrun ? (
          <OverBadge overSeconds={p.elapsedSeconds - p.estimateSeconds} />
        ) : (
          <SubLine>
            {p.hasEstimate
              ? `${Math.round(p.estimateSeconds / 60)} min · ${pct}%`
              : formatDurationCompact(p.elapsedSeconds)}
          </SubLine>
        )}
      </CenterStack>
    </>
  );
}

/**
 * Typographic: hero digits, a hairline progress bar when there is an estimate,
 * and nothing else. The quietest face — the ambient scene carries the mood.
 *
 * Unlike the circular faces this is normal flow, not absolutely positioned:
 * its `type` layout container is wide and content-height (see `ClockLayout`),
 * so the digits can take dedicated-timer-app scale.
 */
function MinimalFace(p: FaceProps) {
  const pct = Math.round(Math.min(p.progress, 100));
  return (
    <div
      className="flex flex-col items-center"
      style={{ gap: "clamp(6px, 2.4cqw, 18px)" }}
    >
      <Digits overrun={p.overrun} size="hero">
        {formatTimer(p.elapsedSeconds)}
      </Digits>
      {p.hasEstimate ? (
        <div
          className="overflow-hidden rounded-full bg-[hsl(var(--focus-accent)/0.15)]"
          style={{
            height: "clamp(3px, 0.5cqw, 5px)",
            width: "56%",
            marginTop: "clamp(4px, 1.2cqw, 12px)"
          }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${Math.min(p.progress, 100)}%`,
              background: p.overrun ? "hsl(var(--warning))" : "hsl(var(--focus-accent))"
            }}
          />
        </div>
      ) : null}
      {p.overrun ? (
        <OverBadge overSeconds={p.elapsedSeconds - p.estimateSeconds} size="hero" />
      ) : (
        <SubLine size="hero">
          {p.hasEstimate
            ? `${Math.round(p.estimateSeconds / 60)} min · ${pct}%`
            : formatDurationCompact(p.elapsedSeconds)}
        </SubLine>
      )}
    </div>
  );
}
