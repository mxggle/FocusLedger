import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Coffee, Minimize2, Play, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { getRestElapsedSeconds, useRestStore } from "../../stores/restStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { useUiStore } from "../../stores/uiStore";
import { restAccentStyle } from "../ambient/accent";
import { AmbientControls } from "../ambient/AmbientControls";
import { AmbientScene } from "../ambient/AmbientScene";
import { getClockLayout } from "./clocks/registry";
import { FocusButton } from "./FocusButton";
import { RestClock } from "./RestClock";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Full-app rest mode: the deliberate counterpart to the focus zen overlay, and
 * it now shares that overlay's interactive shell. `restZen` drives the
 * fullscreen surface independently of whether a break is running (mirroring
 * `focusZen`), so the top-bar button and Escape *minimize* back to the rest
 * card — they never end the break. Only the explicit "End rest" / "Continue"
 * controls close it. Like focus zen it also drives real OS full-screen.
 */
export function RestOverlay() {
  const rest = useRestStore((state) => state.rest);
  const restZen = useUiStore((state) => state.restZen);
  const setRestZen = useUiStore((state) => state.setRestZen);
  const reduce = useReducedMotion();

  // Escape minimizes the break (same gesture as focus zen's exit) rather than
  // ending it — the rest keeps running behind the rest card.
  useEffect(() => {
    if (!restZen) return;
    function onKey(event: KeyboardEvent) {
      // A Radix layer (e.g. the ambient menu) that just consumed this Escape
      // marks it defaultPrevented — closing it must not also minimize the rest.
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        // Mark the event consumed so a focus zen overlay underneath doesn't
        // also react and exit itself in the same keystroke.
        event.preventDefault();
        setRestZen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restZen, setRestZen]);

  // Drive real OS full-screen alongside the overlay, exactly as focus zen does.
  // Remember whether the window was already full-screen (e.g. a focus zen
  // underneath already put it there) so minimizing the break doesn't drop the
  // user out of a full-screen state they didn't set up via this break.
  const wasFullscreenRef = useRef(false);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const windowHandle = getCurrentWindow();
        if (restZen) {
          wasFullscreenRef.current = await windowHandle.isFullscreen();
          if (!cancelled && !wasFullscreenRef.current) {
            await windowHandle.setFullscreen(true);
          }
        } else if (!wasFullscreenRef.current) {
          await windowHandle.setFullscreen(false);
        }
      } catch (error) {
        console.warn("Rest could not toggle window full-screen", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restZen]);

  return (
    <AnimatePresence>
      {rest && restZen ? (
        <RestStage onMinimize={() => setRestZen(false)} reduce={Boolean(reduce)} />
      ) : null}
    </AnimatePresence>
  );
}

function RestStage({ onMinimize, reduce }: { onMinimize: () => void; reduce: boolean }) {
  const rest = useRestStore((state) => state.rest);
  const endRest = useRestStore((state) => state.endRest);
  const extendRest = useRestStore((state) => state.extendRest);
  const resumeTask = useTaskStore((state) => state.resumeTask);
  // The task whose running focus this rest interrupted — if it's still around,
  // the primary exit continues it in one tap instead of stranding it paused.
  const interruptedTask = useTaskStore((state) =>
    rest?.resumeTaskId
      ? state.tasks.find((task) => task.id === rest.resumeTaskId) ?? null
      : null
  );
  const clockStyle = useSettingsStore((state) => state.settings.focusClockStyle);
  const clockLayout = getClockLayout(clockStyle);
  const now = useTimerStore((state) => state.now);

  // Move focus onto the stage while the app shell behind it is inert, so
  // keyboard users land inside the overlay rather than on a blurred body.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  if (!rest) return null;

  const elapsed = getRestElapsedSeconds(rest, now);
  const remaining = Math.max(0, rest.plannedSeconds - elapsed);
  const done = remaining <= 0;
  const remainingPct = (remaining / rest.plannedSeconds) * 100;
  const backLabel = rest.trigger === "auto" ? "Back to work" : "End rest";

  // High-intent exit: end the break AND restart the interrupted task's clock.
  // Only the explicit button does this — X and Escape just end the rest.
  const continueTask = async () => {
    const taskId = interruptedTask?.id;
    await endRest();
    if (taskId) await resumeTask(taskId);
  };

  return (
    <motion.div
      ref={stageRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Rest"
      className="fixed inset-0 z-50 flex flex-col bg-background outline-none"
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
          onClick={onMinimize}
          aria-label="Minimize rest"
          title="Minimize rest (Esc)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:shadow-ring"
        >
          <Minimize2 className="h-5 w-5" />
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

        {/* Rest clock — same user-selected face as focus mode, counting down.
            Circular faces get a vmin square; the typographic face gets the
            wide, content-height stage (see the zen overlay's hero clock). */}
        <div
          className={clockLayout === "orb" ? "relative aspect-square" : "relative"}
          style={
            clockLayout === "orb"
              ? { width: "clamp(260px, 40vmin, 420px)", containerType: "inline-size" }
              : { width: "min(86%, 880px)", containerType: "inline-size" }
          }
          role="timer"
          aria-label="Rest remaining"
        >
          <RestClock
            clock={clockStyle}
            remainingSeconds={remaining}
            elapsedSeconds={elapsed}
            plannedSeconds={rest.plannedSeconds}
            remainingPct={remainingPct}
            done={done}
            reduce={Boolean(reduce)}
          />
        </div>

        {/* A single calm line — gives permission to disconnect. */}
        <p className="max-w-sm text-center text-sm italic text-muted-foreground">
          {done
            ? "No rush. Come back whenever you're ready."
            : interruptedTask
              ? `Step away — “${interruptedTask.title}” will be waiting.`
              : "Step away — your work will keep."}
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
          {interruptedTask ? (
            <FocusButton
              type="button"
              variant="accent"
              size="lg"
              className="min-w-[132px] max-w-[280px]"
              title={`Continue “${interruptedTask.title}”`}
              onClick={() => void continueTask()}
            >
              <Play className="h-4 w-4 shrink-0" />
              <span className="truncate">Continue: {interruptedTask.title}</span>
            </FocusButton>
          ) : (
            <FocusButton
              type="button"
              variant="accent"
              size="lg"
              className="min-w-[132px]"
              onClick={() => void endRest()}
            >
              {backLabel}
            </FocusButton>
          )}
        </div>
      </div>
    </motion.div>
  );
}
