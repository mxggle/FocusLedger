import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Coffee, Minimize2, Pause, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRestStore } from "../../stores/restStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import { getLiveTaskSeconds, useTimerStore } from "../../stores/timerStore";
import { CELEBRATION_MS, CELEBRATION_MS_REDUCED } from "../../utils/motion";
import { focusAccentStyle } from "../ambient/accent";
import { AmbientControls } from "../ambient/AmbientControls";
import { AmbientScene } from "../ambient/AmbientScene";
import { Badge } from "../ui/Badge";
import { CategoryDot } from "../ui/CategoryDot";
import { cn } from "../../utils/cn";
import { getClockLayout } from "./clocks/registry";
import { FocusButton } from "./FocusButton";
import { FocusCelebration } from "./FocusCelebration";
import { FocusClock } from "./FocusClock";
import { StopSessionDialog } from "./StopSessionDialog";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Full-app focus mode ("zen"): a fixed overlay that hands the entire window —
 * sidebar and all — to one running session, and puts the OS window itself
 * into true full-screen (hiding the menu bar / dock) for the duration. Exit
 * via the corner button or Escape restores the window to whatever state it
 * was in before entering.
 *
 * This is a bespoke layout rather than the focus *card* blown up: full-screen
 * focus wants a different composition (centered, airy, big ring) than a packed
 * side pane. It shares the ring, celebration, and stop dialog with the card.
 */
export function FocusZenOverlay() {
  const focusZen = useUiStore((state) => state.focusZen);
  const setFocusZen = useUiStore((state) => state.setFocusZen);
  const sceneId = useSettingsStore((state) => state.settings.ambientScene);
  const reduce = useReducedMotion();

  // Escape exits — the expected gesture for any full-screen surface.
  useEffect(() => {
    if (!focusZen) return;
    function onKey(event: KeyboardEvent) {
      // A Radix layer (stop dialog, ambient menu) that just consumed this
      // Escape marks it defaultPrevented — closing it must not also exit zen.
      if (event.defaultPrevented) return;
      // While the fullscreen rest overlay sits on top of zen, Escape belongs to
      // it — it minimizes the break and drops the user back into zen, still
      // full-screen. A break running behind the rest card (restZen off) does
      // not intercept: Escape then exits zen as usual.
      if (useUiStore.getState().restZen) return;
      if (event.key === "Escape") setFocusZen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusZen, setFocusZen]);

  // Drive real OS full-screen alongside the in-app overlay. Remember whether
  // the window was already full-screen so exiting zen doesn't drop the user
  // out of a full-screen state they set up themselves before focusing.
  const wasFullscreenRef = useRef(false);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const windowHandle = getCurrentWindow();
        if (focusZen) {
          wasFullscreenRef.current = await windowHandle.isFullscreen();
          if (!cancelled && !wasFullscreenRef.current) {
            await windowHandle.setFullscreen(true);
          }
        } else if (!wasFullscreenRef.current) {
          await windowHandle.setFullscreen(false);
        }
      } catch (error) {
        console.warn("Full-screen focus could not toggle window full-screen", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusZen]);

  // Move focus onto the stage while the app shell behind it is inert, so
  // keyboard users land inside the overlay rather than on a blurred body.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusZen) stageRef.current?.focus();
  }, [focusZen]);

  return (
    <AnimatePresence>
      {focusZen ? (
        <motion.div
          ref={stageRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen focus"
          className="fixed inset-0 z-50 flex flex-col bg-background outline-none"
          style={focusAccentStyle(sceneId)}
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

/** Mouse-idle window before the zen chrome (top bar + controls) fades away. */
const CHROME_IDLE_MS = 3000;

function ZenStage({ onExit, reduce }: { onExit: () => void; reduce: boolean }) {
  const clockStyle = useSettingsStore((state) => state.settings.focusClockStyle);
  const clockLayout = getClockLayout(clockStyle);
  const focusedTask = useTaskStore((state) => state.focusedTask);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const categories = useTaskStore((state) => state.categories);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const pauseActiveTask = useTaskStore((state) => state.pauseActiveTask);
  const resumeTask = useTaskStore((state) => state.resumeTask);
  const maybeAutoRestAfter = useRestStore((state) => state.maybeAutoRestAfter);
  const startRest = useRestStore((state) => state.startRest);
  const restEnabled = useSettingsStore((state) => state.settings.restEnabled);
  const now = useTimerStore((state) => state.now);

  const [stopOpen, setStopOpen] = useState(false);
  const [celebration, setCelebration] = useState<{ seconds: number } | null>(null);

  // Chrome auto-hide: after CHROME_IDLE_MS without pointer or key activity the
  // top bar and control pills fade out (and the cursor hides), leaving only
  // the clock — the expected behavior for a full-screen timer. Any movement or
  // keypress brings them back; see `hideChrome` below for the exceptions.
  const [inputIdle, setInputIdle] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setInputIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setInputIdle(true), CHROME_IDLE_MS);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

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

  // Never hide the chrome when it's needed: a paused session, an open stop
  // dialog, or the celebration all keep the controls (and cursor) around.
  const hideChrome = inputIdle && isRunning && !stopOpen && !celebration;
  const chromeClass = cn(
    "transition-opacity duration-500 ease-out",
    hideChrome && "pointer-events-none opacity-0"
  );

  return (
    <>
      {/* ── Ambient background — a calm wash + a breathing aura behind the orb ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Procedural scene (rain/fire/river); renders nothing when "none" */}
        <AmbientScene />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 50% 42%, hsl(var(--focus-accent) / 0.08), transparent 70%)"
          }}
        />
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${
            isRunning ? "motion-safe:animate-[breathe_6s_ease-in-out_infinite]" : ""
          } ${
            overrun
              ? "bg-warning/12"
              : isRunning
                ? "bg-[hsl(var(--focus-accent)/0.13)]"
                : "bg-muted-foreground/8"
          }`}
          style={{ width: "min(56vmin, 560px)", aspectRatio: "1" }}
        />
      </div>

      {/* ── Top bar — atmosphere + exit, to keep the stage uncluttered ── */}
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-end gap-1 px-5 py-4",
          chromeClass
        )}
      >
        <AmbientControls align="end" triggerClassName="h-9 w-9 rounded-lg [&_svg]:h-5 [&_svg]:w-5" />
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit full-screen focus"
          title="Exit full-screen (Esc)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:shadow-ring"
        >
          <Minimize2 className="h-5 w-5" />
        </button>
      </div>

      {/* ── Center stage ── */}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pb-8",
          hideChrome && "cursor-none"
        )}
      >
        {focusedTask ? (
          <>
            {/* Title block */}
            <div className="flex flex-col items-center text-center">
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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

            {/* Hero clock — circular faces get a vmin square; the typographic
                face gets the wide, content-height stage a dedicated timer
                app would give it. */}
            <div
              className={clockLayout === "orb" ? "relative aspect-square" : "relative"}
              style={
                clockLayout === "orb"
                  ? { width: "clamp(260px, 40vmin, 420px)", containerType: "inline-size" }
                  : { width: "min(86%, 880px)", containerType: "inline-size" }
              }
              role="progressbar"
              aria-valuenow={hasEstimate ? pct : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Focus progress"
            >
              <FocusClock
                clock={clockStyle}
                elapsedSeconds={elapsedSeconds}
                estimateSeconds={estimateSeconds}
                hasEstimate={hasEstimate}
                progress={progress}
                overrun={overrun}
                isRunning={isRunning}
                reduce={reduce}
              />
            </div>

            {/* Controls — understated centered pills in the scene's accent */}
            <div className={cn("flex items-center gap-3", chromeClass)}>
              {isRunning ? (
                <FocusButton
                  type="button"
                  variant="glass"
                  size="lg"
                  className="min-w-[132px]"
                  onClick={() => void pauseActiveTask()}
                >
                  <Pause className="h-4 w-4 shrink-0" />
                  Pause
                </FocusButton>
              ) : (
                <FocusButton
                  type="button"
                  variant="accent"
                  size="lg"
                  className="min-w-[132px]"
                  onClick={() => void resumeTask(focusedTask.id)}
                >
                  <RotateCcw className="h-4 w-4 shrink-0" />
                  Resume
                </FocusButton>
              )}
              {restEnabled ? (
                <FocusButton
                  type="button"
                  variant="glass"
                  size="lg"
                  className="min-w-[132px]"
                  onClick={() => void startRest()}
                >
                  <Coffee className="h-4 w-4 shrink-0" />
                  Break
                </FocusButton>
              ) : null}
              <FocusButton
                type="button"
                variant={isRunning ? "accent" : "glass"}
                size="lg"
                className="min-w-[132px]"
                onClick={() => setStopOpen(true)}
              >
                <Check className="h-4 w-4 shrink-0" />
                Done
              </FocusButton>
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
        onDone={(seconds) => {
          setCelebration({ seconds });
          maybeAutoRestAfter(seconds);
        }}
      />
    </>
  );
}
