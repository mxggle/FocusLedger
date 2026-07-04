import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Coffee, Maximize2, Pause, RotateCcw, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRestStore } from "../../stores/restStore";
import { useTaskStore } from "../../stores/taskStore";
import { getLiveTaskSeconds, useTimerStore } from "../../stores/timerStore";
import { formatDurationCompact, formatTimer } from "../../utils/duration";
import {
  CELEBRATION_MS,
  CELEBRATION_MS_REDUCED,
  COMMIT_WHISPER_MS,
  settle
} from "../../utils/motion";
import { useSettingsStore } from "../../stores/settingsStore";
import { focusAccentStyle } from "../ambient/accent";
import { AmbientControls } from "../ambient/AmbientControls";
import { AmbientScene } from "../ambient/AmbientScene";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { EmptyState } from "../ui/EmptyState";
import { FocusButton } from "./FocusButton";
import { FocusCelebration } from "./FocusCelebration";
import { FocusRing } from "./FocusRing";
import { StopSessionDialog } from "./StopSessionDialog";

export function CurrentFocus({ onExpand }: { onExpand?: () => void } = {}) {
  const focusedTask = useTaskStore((state) => state.focusedTask);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const categories = useTaskStore((state) => state.categories);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const pauseActiveTask = useTaskStore((state) => state.pauseActiveTask);
  const resumeTask = useTaskStore((state) => state.resumeTask);
  const now = useTimerStore((state) => state.now);
  const sceneId = useSettingsStore((state) => state.settings.ambientScene);
  const restEnabled = useSettingsStore((state) => state.settings.restEnabled);
  const startRest = useRestStore((state) => state.startRest);
  const maybeAutoRestAfter = useRestStore((state) => state.maybeAutoRestAfter);
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
      <div className="h-full p-4">
      <EmptyState
        icon={Timer}
        title="Nothing running — your time's just ticking."
        hint="Pick a task from the Tasks pane and make the next block count."
        className="h-full min-h-[400px]"
        dashed
        action={
          restEnabled ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void startRest()}
            >
              <Coffee className="h-4 w-4" />
              Take a break
            </Button>
          ) : undefined
        }
      />
      </div>
    );
  }

  const category = focusedTask
    ? categories.find((item) => item.id === focusedTask.category_id)
    : undefined;
  const pct = Math.round(Math.min(progress, 100));
  const commitMinutes = commit?.minutes ?? null;

  return (
    // Frameless: the Today Focus pane supplies the card chrome, so the stage
    // and its ambient scene run edge-to-edge inside it.
    <div
      className="relative flex h-full min-h-[460px] flex-col overflow-hidden"
      style={focusAccentStyle(sceneId)}
    >
      {focusedTask ? (
        <>
      {/* Header band — a wash in the active scene's accent so the title block
          reads as the same surface as the stage below it. */}
      <div className="bg-gradient-to-b from-[hsl(var(--focus-accent)/0.10)] to-transparent px-6 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {isRunning ? (
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping ${
                  overrun ? "bg-warning" : "bg-[hsl(var(--focus-accent))]"
                }`}
              />
            ) : null}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isRunning
                  ? overrun
                    ? "bg-warning"
                    : "bg-[hsl(var(--focus-accent))]"
                  : "bg-muted-foreground/40"
              }`}
            />
          </span>
          {/* Status, not a title — the pane header already says "Focus". */}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isRunning ? "In session" : "Paused"}
          </span>
          <div className="ml-auto -my-1 -mr-1.5 flex items-center gap-0.5">
            <AmbientControls align="end" />
            {onExpand ? (
              <button
                type="button"
                onClick={onExpand}
                aria-label="Expand focus to full screen"
                title="Full-screen focus"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:shadow-ring"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
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
          {/* Procedural scene (rain/fire/river); renders nothing when "none" */}
          <AmbientScene />
          {/* Soft base wash — tinted to the scene accent */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 42%, hsl(var(--focus-accent) / 0.06), transparent 72%)"
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
                  ? "bg-[hsl(var(--focus-accent)/0.16)]"
                  : "bg-muted-foreground/10"
            }`}
            style={{ width: "clamp(220px, 78%, 360px)", aspectRatio: "1" }}
          />
          {/* Commit ignite — a one-shot glow when a new session begins */}
          <AnimatePresence>
            {commit && !reduce ? (
              <motion.div
                key={commit.id}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--focus-accent)/0.24)] blur-3xl"
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
            isRunning={isRunning}
            reduce={Boolean(reduce)}
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

      {/* Controls — a frosted shelf that blends down out of the stage rather than
          a hard opaque footer, so the scene's glow carries through. Collapses to
          icon-only on narrow panes (see .focus-controls in styles.css) so labels
          never truncate to "P… / St… / D…". */}
      <div className="focus-controls flex items-center gap-2.5 border-t border-[hsl(var(--focus-accent)/0.12)] bg-gradient-to-t from-[hsl(var(--surface)/0.9)] via-[hsl(var(--surface)/0.55)] to-transparent px-3.5 py-3.5 backdrop-blur-sm">
        {isRunning ? (
          <FocusButton
            type="button"
            variant="glass"
            className="min-w-0 flex-1 px-3"
            aria-label="Pause"
            title="Pause"
            onClick={() => void pauseActiveTask()}
          >
            <Pause className="h-4 w-4 shrink-0" />
            <span className="focus-control-label truncate">Pause</span>
          </FocusButton>
        ) : (
          <FocusButton
            type="button"
            variant="accent"
            className="min-w-0 flex-1 px-3"
            aria-label="Resume"
            title="Resume"
            onClick={() => void resumeTask(focusedTask.id)}
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span className="focus-control-label truncate">Resume</span>
          </FocusButton>
        )}
        <FocusButton
          type="button"
          variant={isRunning ? "accent" : "glass"}
          className="min-w-0 flex-1 px-3"
          aria-label="Done"
          title="Done"
          onClick={() => setStopOpen(true)}
        >
          <Check className="h-4 w-4 shrink-0" />
          <span className="focus-control-label truncate">Done</span>
        </FocusButton>
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
        onDone={(seconds) => {
          setCelebration({ seconds });
          maybeAutoRestAfter(seconds);
        }}
      />
    </div>
  );
}
