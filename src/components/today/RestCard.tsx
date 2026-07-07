import { useReducedMotion } from "framer-motion";
import { Coffee, Maximize2, Play, Plus } from "lucide-react";
import { getRestElapsedSeconds, useRestStore } from "../../stores/restStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { restAccentStyle } from "../ambient/accent";
import { AmbientControls } from "../ambient/AmbientControls";
import { AmbientScene } from "../ambient/AmbientScene";
import { getClockLayout } from "./clocks/registry";
import { FocusButton } from "./FocusButton";
import { RestClock } from "./RestClock";

/**
 * The minimized rest surface: the in-pane counterpart to the fullscreen rest
 * overlay, mirroring how `CurrentFocus` is the minimized counterpart to focus
 * zen. It shows the same draining clock and controls, plus an expand button to
 * reopen the fullscreen break. Rendered in the Today Focus pane whenever a break
 * is running but not zen'd; `onExpand` re-enters `restZen`.
 */
export function RestCard({ onExpand }: { onExpand?: () => void } = {}) {
  const rest = useRestStore((state) => state.rest);
  const endRest = useRestStore((state) => state.endRest);
  const extendRest = useRestStore((state) => state.extendRest);
  const resumeTask = useTaskStore((state) => state.resumeTask);
  const interruptedTask = useTaskStore((state) =>
    rest?.resumeTaskId
      ? state.tasks.find((task) => task.id === rest.resumeTaskId) ?? null
      : null
  );
  const clockStyle = useSettingsStore((state) => state.settings.focusClockStyle);
  const clockLayout = getClockLayout(clockStyle);
  const now = useTimerStore((state) => state.now);
  const reduce = useReducedMotion();

  if (!rest) return null;

  const elapsed = getRestElapsedSeconds(rest, now);
  const remaining = Math.max(0, rest.plannedSeconds - elapsed);
  const done = remaining <= 0;
  const remainingPct = (remaining / rest.plannedSeconds) * 100;
  const backLabel = rest.trigger === "auto" ? "Back to work" : "End rest";

  // High-intent exit: end the break AND restart the interrupted task's clock —
  // the same one-tap "continue" the fullscreen overlay offers.
  const continueTask = async () => {
    const taskId = interruptedTask?.id;
    await endRest();
    if (taskId) await resumeTask(taskId);
  };

  return (
    // Frameless, like CurrentFocus: the Focus pane supplies the card chrome so
    // the ambient scene bleeds to its edges.
    <div
      className="relative flex h-full min-h-[460px] flex-col overflow-hidden"
      style={restAccentStyle()}
    >
      {/* Header band — a wash in the rest accent, matching the focus card. */}
      <div className="bg-gradient-to-b from-[hsl(var(--focus-accent)/0.10)] to-transparent px-6 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <Coffee className="h-3.5 w-3.5 text-[hsl(var(--focus-accent))]" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Resting
          </span>
          <div className="ml-auto -my-1 -mr-1.5 flex items-center gap-0.5">
            <AmbientControls align="end" />
            {onExpand ? (
              <button
                type="button"
                onClick={onExpand}
                aria-label="Expand rest to full screen"
                title="Full-screen rest"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:shadow-ring"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-2.5 truncate text-sm italic text-muted-foreground">
          {done
            ? "No rush. Come back whenever you're ready."
            : interruptedTask
              ? `“${interruptedTask.title}” will be waiting.`
              : "Your work will keep."}
        </p>
      </div>

      {/* Rest stage — the same draining clock as the overlay, sized for the pane. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-6">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <AmbientScene />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 42%, hsl(var(--focus-accent) / 0.06), transparent 72%)"
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--focus-accent)/0.12)] blur-3xl motion-safe:animate-[breathe_8s_ease-in-out_infinite]"
            style={{ width: "clamp(220px, 78%, 360px)", aspectRatio: "1" }}
          />
        </div>

        <div
          className={clockLayout === "orb" ? "relative aspect-square" : "relative"}
          style={
            clockLayout === "orb"
              ? { width: "clamp(184px, 64%, 256px)", containerType: "inline-size" }
              : { width: "min(88%, 340px)", containerType: "inline-size" }
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
      </div>

      {/* Controls — mirrors the focus card's frosted shelf. */}
      <div className="focus-controls flex items-center gap-2.5 border-t border-[hsl(var(--focus-accent)/0.12)] bg-gradient-to-t from-[hsl(var(--surface)/0.9)] via-[hsl(var(--surface)/0.55)] to-transparent px-3.5 py-3.5 backdrop-blur-sm">
        <FocusButton
          type="button"
          variant="glass"
          className="min-w-0 flex-1 px-3"
          aria-label="Add 5 minutes"
          title="Add 5 minutes"
          onClick={() => extendRest(5)}
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="focus-control-label truncate">5 min</span>
        </FocusButton>
        {interruptedTask ? (
          <FocusButton
            type="button"
            variant="accent"
            className="min-w-0 flex-1 px-3"
            aria-label={`Continue “${interruptedTask.title}”`}
            title={`Continue “${interruptedTask.title}”`}
            onClick={() => void continueTask()}
          >
            <Play className="h-4 w-4 shrink-0" />
            <span className="focus-control-label truncate">Continue</span>
          </FocusButton>
        ) : (
          <FocusButton
            type="button"
            variant="accent"
            className="min-w-0 flex-1 px-3"
            aria-label={backLabel}
            title={backLabel}
            onClick={() => void endRest()}
          >
            <span className="focus-control-label truncate">{backLabel}</span>
          </FocusButton>
        )}
      </div>
    </div>
  );
}
