import { useEffect, useRef } from "react";
import { useTaskStore } from "../stores/taskStore";
import { toDateKey } from "../utils/date";

const CHECK_INTERVAL_MS = 30_000;

/**
 * Refresh task state when the calendar day changes while the app stays open.
 *
 * The Today view is computed against the current real-world day, so without a
 * trigger an app left running past midnight would keep showing the previous day.
 * This polls for a day change and also re-checks when the window regains focus
 * or visibility (e.g. after the machine wakes from sleep).
 */
export function useDayRollover(): void {
  const refresh = useTaskStore((state) => state.refresh);
  const lastDayRef = useRef(toDateKey());

  useEffect(() => {
    function checkDayChange() {
      const currentDay = toDateKey();
      if (currentDay !== lastDayRef.current) {
        lastDayRef.current = currentDay;
        void refresh();
      }
    }

    const intervalId = window.setInterval(checkDayChange, CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkDayChange);
    document.addEventListener("visibilitychange", checkDayChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkDayChange);
      document.removeEventListener("visibilitychange", checkDayChange);
    };
  }, [refresh]);
}
