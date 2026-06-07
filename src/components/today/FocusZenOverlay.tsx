import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Minimize2, Pause, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import { getLiveTaskSeconds, useTimerStore } from "../../stores/timerStore";
import { formatDurationCompact, formatTimer } from "../../utils/duration";
import { CELEBRATION_MS, CELEBRATION_MS_REDUCED } from "../../utils/motion";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { FocusCelebration } from "./FocusCelebration";
import { FocusRing } from "./FocusRing";
import { StopSessionDialog } from "./StopSessionDialog";

/**
 * Full-app focus mode ("zen"): a fixed overlay that hands the entire window —
 * sidebar and all — to one running session. Not OS full-screen; just an
 * immersive, borderless stage with the timer ring as the hero. Exit via the
 * corner button or Escape.
 *
 * This is a bespoke layout rather than the focus *card* blown up: full-screen
 * focus wants a different composition (centered, airy, big ring) than a packed
 * side pane. It shares the ring, celebration, and stop dialog with the card.
 */
export function FocusZenOverlay() {
  const focusZen = useUiStore((state) => state.focusZen);
  const setFocusZen = useUiStore((state) => state.setFocusZen);
  const reduce = useReducedMotion();

  // Escape exits — the expected gesture for any full-screen surface.
  useEffect(() => {
    if (!focusZen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setFocusZen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusZen, setFocusZen]);

  return (
    <AnimatePresence>
      {focusZen ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen focus"
          className="fixed inset-0 z-50 flex flex-col bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.28, ease: "easeOut" }}
        >
          <ZenStage onExit={() => setFocusZen(false)} reduce={Boolean(reduce)} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ZenStage({ onExit, reduce }: { onExit: () => void; reduce: boolean }) {
  const focusedTask = useTaskStore((state) => state.focusedTask);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const categories = useTaskStore((state) => state.categories);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const pauseActiveTask = useTaskStore((state) => state.pauseActiveTask);
  const resumeTask = useTaskStore((state) => state.resumeTask);
  const now = useTimerStore((state) => state.now);

  const [stopOpen, setStopOpen] = useState(false);
  const [celebration, setCelebration] = useState<{ seconds: number } | null>(null);

  const isRunning = Boolean(
    focusedTask && activeEntry && activeEntry.task_id === focusedTask.id
  );
  const elapsedSeconds = focusedTask
    ? getLiveTaskSeconds(focusedTask.id, activeEntry, closedTaskDurations, now)
    : 0;
  const estimateSeconds = (focusedTask?.estimated_minutes ?? 0) * 60;
  const hasEstimate = estimateSeconds > 0;
  const progress = hasEstimate ? (elapsedSeconds / estimateSeconds) * 100 : 0;
  const overrun = hasEstimate && elapsedSeconds > estimateSeconds;
  const pct = Math.round(Math.min(progress, 100));

  const elapsedRef = useRef(0);
  elapsedRef.current = elapsedSeconds;

  // Clear the celebration after it plays, then leave zen — the session is over,
  // so returning to the normal view is the natural next beat.
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(
      () => {
        setCelebration(null);
        onExit();
      },
      reduce ? CELEBRATION_MS_REDUCED : CELEBRATION_MS
    );
    return () => clearTimeout(timer);
  }, [celebration, reduce, onExit]);

  // If focus clears without a celebration (e.g. the task was dropped), don't
  // strand the user on an empty full-screen — fall back to the normal view.
  // The short delay is deliberate: on "done" the task clears one render before
  // the celebration state lands, and this lets that arrive and cancel the exit
  // (the celebration's own effect handles leaving zen afterwards).
  useEffect(() => {
    if (focusedTask || celebration) return;
    const timer = setTimeout(onExit, 400);
    return () => clearTimeout(timer);
  }, [focusedTask, celebration, onExit]);

  const category = focusedTask
    ? categories.find((item) => item.id === focusedTask.category_id)
    : undefined;

  return (
    <>
      {/* ── Ambient background — a calm wash + a breathing aura behind the orb ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 50% 42%, hsl(var(--primary) / 0.07), transparent 70%)"
          }}
        />
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${
            isRunning ? "motion-safe:animate-[breathe_6s_ease-in-out_infinite]" : ""
          } ${
            overrun
              ? "bg-warning/12"
              : isRunning
                ? "bg-primary/12"
                : "bg-muted-foreground/8"
          }`}
          style={{ width: "min(56vmin, 560px)", aspectRatio: "1" }}
        />
      </div>

      {/* ── Top bar — just the exit affordance, to keep the stage uncluttered ── */}
      <div className="relative flex shrink-0 items-center justify-end px-5 py-4">
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit full-screen focus"
          title="Exit full-screen (Esc)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none"
        >
          <Minimize2 className="h-5 w-5" />
        </button>
      </div>

      {/* ── Center stage ── */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pb-8">
        {focusedTask ? (
          <>
            {/* Title block */}
            <div className="flex flex-col items-center text-center">
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  {isRunning ? (
                    <span
                      className={`absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping ${
                        overrun ? "bg-warning" : "bg-primary"
                      }`}
                    />
                  ) : null}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      isRunning
                        ? overrun
                          ? "bg-warning"
                          : "bg-primary"
                        : "bg-muted-foreground/40"
                    }`}
                  />
                </span>
                {isRunning ? "Current Focus" : "Paused"}
              </span>
              <h1 className="mt-3 max-w-xl text-balance text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
                {focusedTask.title}
              </h1>
              <div className="mt-3">
                <Badge variant="neutral">
                  <CategoryDot color={category?.color} />
                  {category?.name ?? "Inbox"}
                </Badge>
              </div>
            </div>

            {/* Hero ring */}
            <div
              className="relative aspect-square"
              style={{
                width: "clamp(260px, 40vmin, 420px)",
                containerType: "inline-size"
              }}
              role="progressbar"
              aria-valuenow={hasEstimate ? pct : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Focus progress"
            >
              <FocusRing
                pct={Math.min(progress, 100)}
                overrun={overrun}
                hasEstimate={hasEstimate}
                isRunning={isRunning}
                reduce={reduce}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5">
                <div
                  className={`font-mono font-bold tabular-nums leading-none transition-colors ${
                    overrun ? "text-warning" : "text-foreground"
                  }`}
                  style={{ fontSize: "clamp(28px, 12.5cqw, 52px)" }}
                >
                  {formatTimer(elapsedSeconds)}
                </div>
                {overrun ? (
                  <span className="rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-warning-soft-foreground ring-1 ring-inset ring-warning/20">
                    Over by {formatDurationCompact(elapsedSeconds - estimateSeconds)}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground tabular-nums">
                    {hasEstimate
                      ? `${focusedTask.estimated_minutes} min · ${pct}%`
                      : formatDurationCompact(elapsedSeconds)}
                  </span>
                )}
              </div>
            </div>

            {/* Controls — understated centered pills, not full-width bars */}
            <div className="flex items-center gap-3">
              {isRunning ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-w-[128px] px-5"
                  onClick={() => void pauseActiveTask()}
                >
                  <Pause className="h-4 w-4 shrink-0" />
                  Pause
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  className="min-w-[128px] px-5"
                  onClick={() => void resumeTask(focusedTask.id)}
                >
                  <RotateCcw className="h-4 w-4 shrink-0" />
                  Resume
                </Button>
              )}
              <Button
                type="button"
                variant={isRunning ? "primary" : "secondary"}
                className="min-w-[128px] px-5"
                onClick={() => setStopOpen(true)}
              >
                <Check className="h-4 w-4 shrink-0" />
                Done
              </Button>
            </div>
          </>
        ) : null}

        {/* Earned payoff — sits over the stage before zen closes */}
        <AnimatePresence>
          {celebration ? <FocusCelebration seconds={celebration.seconds} /> : null}
        </AnimatePresence>
      </div>

      <StopSessionDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        getElapsedSeconds={() => elapsedRef.current}
        onDone={(seconds) => setCelebration({ seconds })}
      />
    </>
  );
}
