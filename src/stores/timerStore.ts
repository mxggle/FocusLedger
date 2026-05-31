import { create } from "zustand";
import type { TimeEntry } from "../types";

type TimerState = {
  now: Date;
  isRunning: boolean;
  intervalId: number | null;
  startTicker: () => void;
  stopTicker: () => void;
};

export const useTimerStore = create<TimerState>((set, get) => ({
  now: new Date(),
  isRunning: false,
  intervalId: null,

  startTicker: () => {
    if (get().intervalId !== null) {
      return;
    }

    const intervalId = window.setInterval(() => set({ now: new Date(), isRunning: true }), 1000);
    set({ intervalId, isRunning: true, now: new Date() });
  },

  stopTicker: () => {
    const { intervalId } = get();
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
    set({ intervalId: null, isRunning: false, now: new Date() });
  }
}));

export function getLiveTaskSeconds(
  taskId: string,
  activeEntry: TimeEntry | null,
  closedTaskDurations: Record<string, number>,
  now: Date
): number {
  const closedSeconds = closedTaskDurations[taskId] ?? 0;
  if (!activeEntry || activeEntry.task_id !== taskId) {
    return closedSeconds;
  }

  return closedSeconds + Math.max(0, Math.floor((now.getTime() - new Date(activeEntry.start_at).getTime()) / 1000));
}
