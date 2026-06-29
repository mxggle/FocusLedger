import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Coffee, Plus, X } from "lucide-react";
import { useEffect } from "react";
import { getRestElapsedSeconds, useRestStore } from "../../stores/restStore";
import { useTimerStore } from "../../stores/timerStore";
import { formatDurationCompact, formatTimer } from "../../utils/duration";
import { restAccentStyle } from "../ambient/accent";
import { AmbientControls } from "../ambient/AmbientControls";
import { AmbientScene } from "../ambient/AmbientScene";
import { FocusButton } from "./FocusButton";
import { RestRing } from "./RestRing";

/**
 * Full-app rest mode: the deliberate counterpart to the focus zen overlay. Same
 * immersive stage, opposite intent — a moonlit accent, a countdown ring that
 * *drains* instead of fills, a slow breathing orb, and copy that gives you
 * permission to step away. Closing it (button or Escape) ends the break; rest is
 * the whole mode here, so there is no "minimized" rest card.
 */
export function RestOverlay() {
  const rest = useRestStore((state) => state.rest);
  const endRest = useRestStore((state) => state.endRest);

  useEffect(() => {
    if (!rest) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") void endRest();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rest, endRest]);

  return (
    <AnimatePresence>
      {rest ? <RestStage /> : null}
    </AnimatePresence>
  );
}

function RestStage() {
  const rest = useRestStore((state) => state.rest);
  const endRest = useRestStore((state) => state.endRest);
  const extendRest = useRestStore((state) => state.extendRest);
  const now = useTimerStore((state) => state.now);
  const reduce = useReducedMotion();

  if (!rest) return null;

  const elapsed = getRestElapsedSeconds(rest, now);
  const remaining = Math.max(0, rest.plannedSeconds - elapsed);
  const done = remaining <= 0;
  const remainingPct = (remaining / rest.plannedSeconds) * 100;
  const plannedMinutes = Math.round(rest.plannedSeconds / 60);
  const backLabel = rest.trigger === "auto" ? "Back to work" : "End rest";

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Rest"
      className="fixed inset-0 z-50 flex flex-col bg-background"
      style={restAccentStyle()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.32, ease: "easeOut" }}
    >
      {/* ── Ambient background — calmer than focus: a soft wash + a slow aura ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <AmbientScene />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 50% 44%, hsl(var(--focus-accent) / 0.07), transparent 72%)"
          }}
        />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--focus-accent)/0.12)] blur-3xl motion-safe:animate-[breathe_8s_ease-in-out_infinite]"
          style={{ width: "min(56vmin, 560px)", aspectRatio: "1" }}
        />
      </div>

      {/* ── Top bar — atmosphere + exit ── */}
      <div className="relative flex shrink-0 items-center justify-end gap-1 px-5 py-4">
        <AmbientControls align="end" triggerClassName="h-9 w-9 rounded-lg [&_svg]:h-5 [&_svg]:w-5" />
        <button
          type="button"
          onClick={() => void endRest()}
          aria-label="End rest"
          title="End rest (Esc)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ── Center stage ── */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pb-10">
        <div className="flex flex-col items-center text-center">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <Coffee className="h-3.5 w-3.5 text-[hsl(var(--focus-accent))]" />
            Resting
          </span>
        </div>

        {/* Breathing orb: draining ring + remaining time */}
        <div
          className="relative aspect-square"
          style={{ width: "clamp(260px, 40vmin, 420px)", containerType: "inline-size" }}
          role="timer"
          aria-label="Rest remaining"
        >
          <RestRing remainingPct={remainingPct} done={done} reduce={Boolean(reduce)} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            {done ? (
              <>
                <div
                  className="font-semibold tracking-tight text-foreground"
                  style={{ fontSize: "clamp(22px, 8cqw, 34px)" }}
                >
                  Time's up
                </div>
                <span className="text-sm font-medium text-muted-foreground tabular-nums">
                  Rested {formatDurationCompact(elapsed)} · ready when you are
                </span>
              </>
            ) : (
              <>
                <div
                  className="font-mono font-bold tabular-nums leading-none text-foreground"
                  style={{ fontSize: "clamp(28px, 12.5cqw, 52px)" }}
                >
                  {formatTimer(remaining)}
                </div>
                <span className="text-sm font-medium text-muted-foreground tabular-nums">
                  {plannedMinutes} min break
                </span>
              </>
            )}
          </div>
        </div>

        {/* A single calm line — gives permission to disconnect. */}
        <p className="max-w-sm text-center text-sm italic text-muted-foreground">
          {done ? "No rush. Come back whenever you're ready." : "Step away — your work will keep."}
        </p>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <FocusButton
            type="button"
            variant="glass"
            size="lg"
            className="min-w-[132px]"
            onClick={() => extendRest(5)}
          >
            <Plus className="h-4 w-4 shrink-0" />
            5 min
          </FocusButton>
          <FocusButton
            type="button"
            variant="accent"
            size="lg"
            className="min-w-[132px]"
            onClick={() => void endRest()}
          >
            {backLabel}
          </FocusButton>
        </div>
      </div>
    </motion.div>
  );
}
