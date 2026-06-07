import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Hourglass } from "lucide-react";
import { useMemo } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { computeLifeProgress } from "../../utils/lifeWeeks";
import { settle } from "../../utils/motion";

/**
 * A single quiet finitude line at the top of Today — the "Full" framing:
 *   "Week 1,487 of ~4,000"
 *
 * Memento mori, gently. Reuses the same life-weeks math as the Life page and
 * links straight through to it. If the birthday isn't set yet, it shows a soft
 * prompt instead of a broken NaN line.
 */
export function LifeThread({ onOpenLife }: { onOpenLife: () => void }) {
  const birthDate = useSettingsStore((state) => state.settings.birthDate);
  const lifeExpectancyYears = useSettingsStore(
    (state) => state.settings.lifeExpectancyYears
  );
  const reduce = useReducedMotion();

  const progress = useMemo(
    () => computeLifeProgress(birthDate, lifeExpectancyYears),
    [birthDate, lifeExpectancyYears]
  );

  // weeksLived is the count completed; the week you're *living* is the next one.
  const currentWeek = progress ? progress.weeksLived + 1 : 0;
  const totalWeeks = progress?.totalWeeks ?? 0;

  return (
    <motion.button
      type="button"
      onClick={onOpenLife}
      initial={{ opacity: 0, y: reduce ? 0 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={settle}
      className="group flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      title="See your life in weeks"
    >
      <Hourglass className="h-3.5 w-3.5 shrink-0 opacity-70" />
      {progress ? (
        <span className="tabular-nums">
          Week{" "}
          <span className="font-semibold text-foreground">
            {currentWeek.toLocaleString()}
          </span>{" "}
          of ~{totalWeeks.toLocaleString()}
        </span>
      ) : (
        <span>Set your birthday to see your life in weeks</span>
      )}
      <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </motion.button>
  );
}
