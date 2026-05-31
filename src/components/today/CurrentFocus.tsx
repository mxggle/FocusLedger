import { Check, Pause, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { getLiveTaskSeconds, useTimerStore } from "../../stores/timerStore";
import { formatDurationCompact, formatTimer } from "../../utils/duration";
import { Button } from "../ui/Button";
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
  const [overrunReminderKey, setOverrunReminderKey] = useState<string | null>(null);
  const elapsedSeconds = activeTask && activeEntry ? getLiveTaskSeconds(activeTask.id, activeEntry, closedTaskDurations, now) : 0;
  const estimateSeconds = ((activeTask?.estimated_minutes ?? 0) * 60);
  const progress = estimateSeconds > 0 ? (elapsedSeconds / estimateSeconds) * 100 : 0;
  const overrun = estimateSeconds > 0 && elapsedSeconds > estimateSeconds;
  const reminderKey = activeTask ? `${activeTask.id}:${activeTask.estimated_minutes ?? 0}` : null;

  useEffect(() => {
    if (!overrun || !reminderKey || overrunReminderKey === reminderKey) {
      return;
    }

    setOverrunReminderKey(reminderKey);
    const shouldContinue = window.confirm(
      "This task is already over its estimate.\n\nPress OK to continue, or Cancel to end this session."
    );
    if (!shouldContinue) {
      setStopOpen(true);
    }
  }, [overrun, overrunReminderKey, reminderKey]);

  if (!activeTask || !activeEntry) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-md border border-dashed">
        <div className="text-center">
          <div className="text-lg font-semibold">No active focus session.</div>
          <div className="mt-1 text-sm text-muted-foreground">Start a task when you are ready.</div>
        </div>
      </div>
    );
  }

  const category = categories.find((item) => item.id === activeTask.category_id);

  return (
    <div className="flex min-h-[520px] flex-col rounded-md border bg-background p-5">
      <div className="text-sm font-medium text-muted-foreground">Current Focus</div>
      <h2 className="mt-4 text-2xl font-semibold tracking-normal">{activeTask.title}</h2>
      <div className="mt-2 text-sm text-muted-foreground">{category?.name ?? "Inbox"}</div>
      <div className="mt-10 text-center font-mono text-6xl font-semibold tabular-nums">{formatTimer(elapsedSeconds)}</div>
      <div className="mt-8 grid gap-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{activeTask.estimated_minutes ? `Estimate: ${activeTask.estimated_minutes} min` : "No estimate"}</span>
          <span>{estimateSeconds ? `${Math.round(progress)}%` : formatDurationCompact(elapsedSeconds)}</span>
        </div>
        <Progress value={progress} overrun={overrun} />
        {overrun ? <div className="text-xs font-medium text-orange-600">Over estimate</div> : null}
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-8">
        <Button type="button" variant="secondary" onClick={() => void pauseActiveTask()}>
          <Pause className="h-4 w-4" />
          Pause
        </Button>
        <Button type="button" variant="secondary" onClick={() => setStopOpen(true)}>
          <Square className="h-4 w-4" />
          Stop
        </Button>
        <Button type="button" onClick={() => void completeTask(activeTask.id, "Completed from current focus")}>
          <Check className="h-4 w-4" />
          Done
        </Button>
      </div>
      <StopSessionDialog open={stopOpen} onOpenChange={setStopOpen} />
    </div>
  );
}
