import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Pause, RotateCcw, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { getLiveTaskSeconds, useTimerStore } from "../../stores/timerStore";
import { formatDurationCompact, formatTimer } from "../../utils/duration";
import {
  CELEBRATION_MS,
  CELEBRATION_MS_REDUCED,
  COMMIT_WHISPER_MS,
  settle
} from "../../utils/motion";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { EmptyState } from "../ui/EmptyState";
import { FocusCelebration } from "./FocusCelebration";
import { StopSessionDialog } from "./StopSessionDialog";

export function CurrentFocus() {
  const focusedTask = useTaskStore((state) => state.focusedTask);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const categories = useTaskStore((state) => state.categories);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const pauseActiveTask = useTaskStore((state) => state.pauseActiveTask);
  const resumeTask = useTaskStore((state) => state.resumeTask);
  const now = useTimerStore((state) => state.now);
  const reduce = useReducedMotion();
  const [stopOpen, setStopOpen] = useState(false);

  // The earned payoff: holds the finished session length while the celebration
  // plays, so it survives the store clearing the focused task on "done".
  const [celebration, setCelebration] = useState<{ seconds: number } | null>(null);
  // The calm bookend: a one-shot whisper when a *new* session begins.
  const [commit, setCommit] = useState<{ id: number; minutes: number | null } | null>(
    null
  );

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

  // Read the live elapsed without making effects depend on every tick.
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsedSeconds;

  // Commit moment — fires when focus moves to a *new* task that's running.
  // `undefined` on first mount means an already-running session (e.g. app
  // reopened) does not replay the whisper. Switching tasks counts as a new
  // commit; resuming from pause (same id) does not.
  const prevFocusIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevFocusIdRef.current;
    const curId = focusedTask?.id ?? null;
    if (prev !== undefined && curId && curId !== prev && isRunning) {
      setCommit({ id: Date.now(), minutes: focusedTask?.estimated_minutes ?? null });
    }
    prevFocusIdRef.current = curId;
  }, [focusedTask?.id, focusedTask?.estimated_minutes, isRunning]);

  useEffect(() => {
    if (!commit) return;
    const timer = setTimeout(() => setCommit(null), COMMIT_WHISPER_MS);
    return () => clearTimeout(timer);
  }, [commit]);

  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(
      () => setCelebration(null),
      reduce ? CELEBRATION_MS_REDUCED : CELEBRATION_MS
    );
    return () => clearTimeout(timer);
  }, [celebration, reduce]);

  if (!focusedTask && !celebration) {
    return (
      <EmptyState
        icon={Timer}
        title="Nothing running — your time's just ticking."
        hint="Pick a task from the Tasks pane and make the next block count."
        className="h-full min-h-[400px]"
        dashed
      />
    );
  }

  const category = focusedTask
    ? categories.find((item) => item.id === focusedTask.category_id)
    : undefined;
  const pct = Math.round(Math.min(progress, 100));
  const commitMinutes = commit?.minutes ?? null;

  return (
    <div className="relative flex h-full min-h-[460px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      {focusedTask ? (
        <>
      {/* Header band with subtle accent gradient */}
      <div className="bg-gradient-to-b from-primary-soft/60 to-transparent px-6 pt-5 pb-4">
        <div className="flex items-center gap-2">
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
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isRunning ? "Current Focus" : "Paused"}
          </span>
        </div>
        <h2 className="mt-2.5 truncate text-lg font-semibold leading-snug tracking-tight text-foreground">
          {focusedTask.title}
        </h2>
        <div className="mt-2">
          <Badge variant="neutral">
            <CategoryDot color={category?.color} />
            {category?.name ?? "Inbox"}
          </Badge>
        </div>
      </div>

      {/*
        Focus stage — a self-contained canvas that grows to fill the card.
        The absolutely-positioned background layer below is the slot for future
        ambient scenes (rain, fire, white-noise visuals): drop a <video>/<canvas>
        in there and the orb + timer keep floating on top. Add a scrim there too
        if the scene is busy, so the digits stay legible.
      */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-6">
        {/* ── Ambient background layer (replaceable) ── */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/* Soft base wash */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 42%, hsl(var(--primary) / 0.06), transparent 72%)"
            }}
          />
          {/* Breathing aura behind the orb */}
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${
              isRunning ? "motion-safe:animate-[breathe_6s_ease-in-out_infinite]" : ""
            } ${
              overrun
                ? "bg-warning/15"
                : isRunning
                  ? "bg-primary/15"
                  : "bg-muted-foreground/10"
            }`}
            style={{ width: "clamp(220px, 78%, 360px)", aspectRatio: "1" }}
          />
          {/* Commit ignite — a one-shot glow when a new session begins */}
          <AnimatePresence>
            {commit && !reduce ? (
              <motion.div
                key={commit.id}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl"
                style={{ width: "clamp(220px, 80%, 380px)", aspectRatio: "1" }}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: [0, 0.32, 0.16], scale: 1 }}
                exit={{ opacity: 0 }}
                transition={settle}
              />
            ) : null}
          </AnimatePresence>
        </div>

        {/* ── Focus orb: progress ring + timer ── */}
        <div
          className="relative aspect-square"
          style={{
            width: "clamp(184px, 64%, 256px)",
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
          />

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3">
            <div
              className={`font-mono font-bold tabular-nums leading-none transition-colors ${
                overrun ? "text-warning" : "text-foreground"
              }`}
              style={{ fontSize: "clamp(18px, 13.5cqw, 32px)" }}
            >
              {formatTimer(elapsedSeconds)}
            </div>

            {overrun ? (
              <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-soft-foreground ring-1 ring-inset ring-warning/20">
                Over by {formatDurationCompact(elapsedSeconds - estimateSeconds)}
              </span>
            ) : (
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {hasEstimate
                  ? `${focusedTask.estimated_minutes} min · ${pct}%`
                  : formatDurationCompact(elapsedSeconds)}
              </span>
            )}
          </div>
        </div>

        {/* Commit whisper — fades in and out, never holds layout */}
        <AnimatePresence>
          {commit ? (
            <motion.p
              key={commit.id}
              className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-xs italic text-muted-foreground"
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: [0, 1, 1, 0], y: 0 }}
              transition={{
                duration: COMMIT_WHISPER_MS / 1000,
                times: [0, 0.18, 0.8, 1],
                ease: "easeOut"
              }}
            >
              {commitMinutes
                ? `The next ${commitMinutes} minutes are yours.`
                : "This block is yours."}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Controls — collapse to icon-only on narrow panes (see .focus-controls
          in styles.css) so labels never truncate to "P… / St… / D…". */}
      <div className="focus-controls flex items-center gap-2 border-t border-border bg-surface-2/40 px-3 py-3">
        {isRunning ? (
          <Button
            type="button"
            variant="secondary"
            className="min-w-0 flex-1 px-3"
            aria-label="Pause"
            title="Pause"
            onClick={() => void pauseActiveTask()}
          >
            <Pause className="h-4 w-4 shrink-0" />
            <span className="focus-control-label truncate">Pause</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            className="min-w-0 flex-1 px-3"
            aria-label="Resume"
            title="Resume"
            onClick={() => void resumeTask(focusedTask.id)}
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span className="focus-control-label truncate">Resume</span>
          </Button>
        )}
        <Button
          type="button"
          variant={isRunning ? "primary" : "secondary"}
          className="min-w-0 flex-1 px-3"
          aria-label="Done"
          title="Done"
          onClick={() => setStopOpen(true)}
        >
          <Check className="h-4 w-4 shrink-0" />
          <span className="focus-control-label truncate">Done</span>
        </Button>
      </div>
        </>
      ) : null}

      {/* Earned payoff — sits over the stage and lingers after focus clears */}
      <AnimatePresence>
        {celebration ? <FocusCelebration seconds={celebration.seconds} /> : null}
      </AnimatePresence>

      <StopSessionDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        getElapsedSeconds={() => elapsedRef.current}
        onDone={(seconds) => setCelebration({ seconds })}
      />
    </div>
  );
}

/**
 * Circular ring framing the timer. With an estimate it shows a track + animated
 * progress arc; without one it's just a faint decorative frame (a full muted
 * "0% progress" ring read as stuck/odd).
 */
function FocusRing({
  pct,
  overrun,
  hasEstimate
}: {
  pct: number;
  overrun: boolean;
  hasEstimate: boolean;
}) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const stroke = overrun ? "hsl(var(--warning))" : "url(#focusRingStroke)";

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
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
      <defs>
        <linearGradient id="focusRingStroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--primary) / 0.65)" />
        </linearGradient>
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
        className="transition-[stroke-dashoffset] duration-500 ease-out"
      />
    </svg>
  );
}
