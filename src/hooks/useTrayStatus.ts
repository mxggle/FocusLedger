import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { getRestElapsedSeconds, useRestStore } from "../stores/restStore";
import { useTaskStore } from "../stores/taskStore";
import { getLiveTaskSeconds, useTimerStore } from "../stores/timerStore";
import { formatTimerCompact } from "../utils/duration";

export function useTrayStatus() {
  const activeTask = useTaskStore((state) => state.activeTask);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const rest = useRestStore((state) => state.rest);
  const now = useTimerStore((state) => state.now);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let title: string | null;
    let tooltip: string;

    if (activeTask && activeEntry) {
      // A focus session counts up — the elapsed time it's earned so far.
      const elapsed = formatTimerCompact(
        getLiveTaskSeconds(activeTask.id, activeEntry, closedTaskDurations, now)
      );
      title = elapsed;
      tooltip = `${activeTask.title} - ${elapsed}`;
    } else if (rest) {
      // A break counts down — the coffee cup marks it as rest, not focus, and
      // the time is what's left on the planned break.
      const remaining = formatTimerCompact(
        Math.max(0, rest.plannedSeconds - getRestElapsedSeconds(rest, now))
      );
      title = `☕ ${remaining}`;
      tooltip = `Resting - ${remaining} left`;
    } else {
      title = null;
      tooltip = "Yolo - no active focus session";
    }

    void invoke("update_tray_status", { title, tooltip }).catch((error) => {
      console.warn("Tray status could not be updated", error);
    });
  }, [activeEntry, activeTask, closedTaskDurations, rest, now]);
}
