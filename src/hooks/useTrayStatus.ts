import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useTaskStore } from "../stores/taskStore";
import { getLiveTaskSeconds, useTimerStore } from "../stores/timerStore";
import { formatTimerCompact } from "../utils/duration";

export function useTrayStatus() {
  const activeTask = useTaskStore((state) => state.activeTask);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const closedTaskDurations = useTaskStore((state) => state.closedTaskDurations);
  const now = useTimerStore((state) => state.now);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const elapsedSeconds =
      activeTask && activeEntry ? getLiveTaskSeconds(activeTask.id, activeEntry, closedTaskDurations, now) : 0;
    const elapsed = formatTimerCompact(elapsedSeconds);
    const title = activeTask && activeEntry ? elapsed : null;
    const tooltip =
      activeTask && activeEntry ? `${activeTask.title} - ${elapsed}` : "Yolo - no active focus session";

    void invoke("update_tray_status", { title, tooltip }).catch((error) => {
      console.warn("Tray status could not be updated", error);
    });
  }, [activeEntry, activeTask, closedTaskDurations, now]);
}
