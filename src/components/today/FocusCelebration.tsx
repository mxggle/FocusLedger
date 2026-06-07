import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { formatDurationCompact } from "../../utils/duration";
import { celebrate, settle } from "../../utils/motion";

/**
 * The earned payoff — fires once when a focus session ends with "done".
 * Intensity "Confident burst": the ring snaps full, a warm burst blooms, a
 * handful of sparks fly out, the orb overshoots once, then everything settles.
 *
 * Renders as an absolute overlay so it can sit on top of the focus stage (and
 * keep showing for a beat after the focused task is cleared from the store).
 *
 * The warm orange→violet accent is deliberate: it sets the win apart from the
 * calm blue of the running focus state.
 */

const BURST = "radial-gradient(circle, hsl(24 100% 64% / 0.9), hsl(276 84% 64% / 0))";
const SPARK_COLORS = [
  "#ff7a4d",
  "#ffd23f",
  "#6affd3",
  "#b14bff",
  "#3aa0ff",
  "#ff2d55"
];

export function FocusCelebration({ seconds }: { seconds: number }) {
  const reduce = useReducedMotion();

  const sparks = useMemo(() => {
    const count = 10;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const distance = 70 + (i % 3) * 12;
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        color: SPARK_COLORS[i % SPARK_COLORS.length]
      };
    });
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={settle}
    >
      {/* Scrim so the message stays legible over any ambient scene. */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" aria-hidden />

      <div className="relative flex flex-col items-center">
        {/* Burst glow */}
        <motion.div
          aria-hidden
          className="absolute left-1/2 top-[44px] -translate-x-1/2 rounded-full blur-2xl"
          style={{ width: 180, height: 180, background: BURST }}
          initial={{ opacity: 0, scale: reduce ? 1 : 0.6 }}
          animate={{ opacity: reduce ? 0.22 : [0, 0.7, 0.24], scale: reduce ? 1 : 1.1 }}
          transition={celebrate}
        />

        {/* Sparks — skipped entirely under reduced motion */}
        {!reduce
          ? sparks.map((spark, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="absolute left-1/2 top-[88px] h-[7px] w-[7px] rounded-full"
                style={{ background: spark.color }}
                initial={{ opacity: 0, x: -3, y: -3, scale: 0.4 }}
                animate={{ opacity: [0, 1, 0], x: spark.x, y: spark.y, scale: 1 }}
                transition={{ ...celebrate, duration: 0.85 }}
              />
            ))
          : null}

        {/* Orb with the full ring + duration */}
        <motion.div
          className="relative flex h-[118px] w-[118px] items-center justify-center"
          initial={{ scale: reduce ? 1 : 0.9 }}
          animate={{ scale: reduce ? 1 : [0.9, 1.12, 1] }}
          transition={{ ...celebrate, delay: reduce ? 0 : 0.1 }}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90 h-full w-full" aria-hidden>
            <defs>
              <linearGradient id="celebrateRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="hsl(24 100% 62%)" />
                <stop offset="100%" stopColor="hsl(276 84% 64%)" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
            <motion.circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="url(#celebrateRing)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 46}
              initial={{ strokeDashoffset: reduce ? 0 : 2 * Math.PI * 46 }}
              animate={{ strokeDashoffset: 0 }}
              transition={reduce ? { duration: 0 } : celebrate}
            />
          </svg>
          <span className="font-mono text-xl font-bold tabular-nums text-foreground">
            {formatDurationCompact(seconds)}
          </span>
        </motion.div>

        <motion.p
          className="mt-3 text-sm font-medium text-muted-foreground"
          initial={{ opacity: 0, y: reduce ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...settle, delay: reduce ? 0 : 0.2 }}
        >
          Made it count.
        </motion.p>
      </div>
    </motion.div>
  );
}
