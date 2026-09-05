import { formatDurationCompact, formatTimer } from "../../utils/duration";
import { normalizeClockId } from "./clocks/registry";
import { CenterStack, Digits, SubLine } from "./FocusClock";
import { RestRing } from "./RestRing";

/**
 * The face of a rest break, in the same user-selectable styles as the focus
 * clock so entering a break doesn't visually change the app out from under the
 * user. Same container contract as `FocusClock` (square `orb` / wide `type`,
 * `container-type: inline-size`), opposite semantics: everything counts *down*
 * and progress *drains*.
 *
 * A break is already a countdown, so the "ring" and "countdown" styles land on
 * the same face — the draining rest ring.
 */
export function RestClock({
  clock,
  ...face
}: RestFaceProps & {
  /** Raw `focusClockStyle` setting; unknown values fall back to the ring. */
  clock: string;
}) {
  switch (normalizeClockId(clock)) {
    case "dial":
      return <RestDialFace {...face} />;
    case "minimal":
      return <RestMinimalFace {...face} />;
    default:
      return <RestRingFace {...face} />;
  }
}

type RestFaceProps = {
  remainingSeconds: number;
  elapsedSeconds: number;
  plannedSeconds: number;
  /** Portion of the planned break still remaining, 0–100. */
  remainingPct: number;
  /** True once the planned time is spent — faces switch to "Time's up". */
  done: boolean;
  reduce: boolean;
};

/** "Time's up" heading sizes, mirroring the digit scale of each layout. */
const DONE_SIZES = {
  framed: "clamp(22px, 8cqw, 34px)",
  hero: "clamp(26px, 6cqw, 46px)"
} as const;

/**
 * Digits + subline while the break runs, "Time's up" + rested total once it's
 * over. Shared by every face; only the type scale differs.
 */
function RestReadout({
  p,
  size = "framed"
}: {
  p: RestFaceProps;
  size?: keyof typeof DONE_SIZES;
}) {
  if (p.done) {
    return (
      <>
        <div
          className="font-semibold tracking-tight text-foreground"
          style={{ fontSize: DONE_SIZES[size] }}
        >
          Time's up
        </div>
        {/* Just the total. Both rest surfaces already print "No rush. Come
            back whenever you're ready." beside the clock, and the longer line
            wrapped out of the circular faces. */}
        <SubLine size={size}>Rested {formatDurationCompact(p.elapsedSeconds)}</SubLine>
      </>
    );
  }
  return (
    <>
      <Digits overrun={false} size={size === "hero" ? "hero" : "framed"}>
        {formatTimer(p.remainingSeconds)}
      </Digits>
      <SubLine size={size}>{Math.round(p.plannedSeconds / 60)} min break</SubLine>
    </>
  );
}

/* ── Faces ─────────────────────────────────────────────────────────────── */

/** Ring & countdown styles: remaining time inside the draining rest ring. */
function RestRingFace(p: RestFaceProps) {
  return (
    <>
      <RestRing remainingPct={p.remainingPct} done={p.done} reduce={p.reduce} />
      <CenterStack>
        <RestReadout p={p} />
      </CenterStack>
    </>
  );
}

/**
 * Watch face: the focus dial's 60 ticks, but lit ticks are the *remaining*
 * break — the arc unwinds back toward 12 as the break runs down, and the face
 * goes dark once the time is spent.
 */
function RestDialFace(p: RestFaceProps) {
  const litCount = p.done
    ? 0
    : Math.ceil((Math.max(0, Math.min(100, p.remainingPct)) / 100) * 60);
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
              stroke={
                i < litCount
                  ? "hsl(var(--focus-accent))"
                  : "hsl(var(--focus-accent) / 0.16)"
              }
              strokeWidth={major ? 2 : 1.4}
              strokeLinecap="round"
              className="transition-colors duration-500"
            />
          );
        })}
      </svg>
      <CenterStack>
        <RestReadout p={p} />
      </CenterStack>
    </>
  );
}

/**
 * Typographic: hero remaining digits over a hairline bar that drains. Normal
 * flow in a wide `type` container, same as the focus minimal face.
 */
function RestMinimalFace(p: RestFaceProps) {
  return (
    <div
      className="flex flex-col items-center"
      style={{ gap: "clamp(6px, 2.4cqw, 18px)" }}
    >
      {p.done ? (
        <RestReadout p={p} size="hero" />
      ) : (
        <>
          <Digits overrun={false} size="hero">
            {formatTimer(p.remainingSeconds)}
          </Digits>
          <div
            className="overflow-hidden rounded-full bg-[hsl(var(--focus-accent)/0.15)]"
            style={{
              height: "clamp(3px, 0.5cqw, 5px)",
              width: "56%",
              marginTop: "clamp(4px, 1.2cqw, 12px)"
            }}
          >
            <div
              className="h-full rounded-full bg-[hsl(var(--focus-accent))] transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.max(0, Math.min(100, p.remainingPct))}%` }}
            />
          </div>
          <SubLine size="hero">{Math.round(p.plannedSeconds / 60)} min break</SubLine>
        </>
      )}
    </div>
  );
}
