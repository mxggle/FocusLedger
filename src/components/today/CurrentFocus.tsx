import { Check, Pause, Square, Timer } from "lucide-react";
import { useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { getLiveTaskSeconds, useTimerStore } from "../../stores/timerStore";
import { formatDurationCompact, formatTimer } from "../../utils/duration";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { EmptyState } from "../ui/EmptyState";
import { Progress } from "../ui/Progress";
import { StopSessionDialog } from "./StopSessionDialog";

export function CurrentFocus() {
  const activeTask = useTaskStore((state) => state.activeTask);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const categories = useTaskStore((state) => state.categories);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const pauseActiveTask = useTaskStore((state) => state.pauseActiveTask);
  const completeTask = useTaskStore((state) => state.completeTask);
  const now = useTimerStore((state) => state.now);
  const [stopOpen, setStopOpen] = useState(false);

  const elapsedSeconds =
    activeTask && activeEntry
      ? getLiveTaskSeconds(activeTask.id, activeEntry, closedTaskDurations, now)
      : 0;
  const estimateSeconds = (activeTask?.estimated_minutes ?? 0) * 60;
  const progress = estimateSeconds > 0 ? (elapsedSeconds / estimateSeconds) * 100 : 0;
  const overrun = estimateSeconds > 0 && elapsedSeconds > estimateSeconds;

  if (!activeTask || !activeEntry) {
    return (
      <EmptyState
        icon={Timer}
        title="No active focus session"
        hint="Start a task from the Tasks pane when you are ready."
        className="min-h-[400px]"
        dashed
      />
    );
  }

  const category = categories.find((item) => item.id === activeTask.category_id);

  return (
    <div className="flex min-h-[440px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      {/* Header band with subtle accent gradient */}
      <div className="bg-gradient-to-b from-primary-soft/60 to-transparent px-6 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping ${
                overrun ? "bg-warning" : "bg-primary"
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                overrun ? "bg-warning" : "bg-primary"
              }`}
            />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Current Focus
          </span>
        </div>
        <h2 className="mt-2.5 text-lg font-semibold leading-snug tracking-tight text-foreground">
          {activeTask.title}
        </h2>
        <div className="mt-2">
          <Badge variant="neutral">
            <CategoryDot color={category?.color} />
            {category?.name ?? "Inbox"}
          </Badge>
        </div>
      </div>

      {/* Hero timer */}
      <div className="flex flex-col items-center gap-1.5 px-6 py-6">
        <div
          className={`font-mono font-bold tabular-nums leading-none transition-colors ${
            overrun ? "text-warning" : "text-foreground"
          }`}
          style={{ fontSize: "clamp(44px, 9vw, 60px)" }}
        >
          {formatTimer(elapsedSeconds)}
        </div>
        {overrun ? (
          <div className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-soft-foreground ring-1 ring-inset ring-warning/20">
            Over by {formatDurationCompact(elapsedSeconds - estimateSeconds)}
          </div>
        ) : null}
      </div>

      {/* Progress */}
      <div className="px-6">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {activeTask.estimated_minutes
              ? `Estimate · ${activeTask.estimated_minutes} min`
              : "No estimate"}
          </span>
          <span className="tabular-nums">
            {estimateSeconds
              ? `${Math.round(Math.min(progress, 100))}%`
              : formatDurationCompact(elapsedSeconds)}
          </span>
        </div>
        <Progress value={progress} overrun={overrun} />
      </div>

      {/* Controls */}
      <div className="mt-auto flex items-center gap-2 border-t border-border bg-surface-2/40 px-6 py-4">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => void pauseActiveTask()}
        >
          <Pause className="h-4 w-4" />
          Pause
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => setStopOpen(true)}
        >
          <Square className="h-4 w-4" />
          Stop
        </Button>
        <Button
          type="button"
          variant="primary"
          className="flex-1"
          onClick={() =>
            void completeTask(activeTask.id, "Completed from current focus")
          }
        >
          <Check className="h-4 w-4" />
          Done
        </Button>
      </div>

      <StopSessionDialog open={stopOpen} onOpenChange={setStopOpen} />
    </div>
  );
}
