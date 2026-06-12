import { useEffect, useRef } from "react";
import { useTaskStore } from "../stores/taskStore";
import { toDateKey } from "../utils/date";

const CHECK_INTERVAL_MS = 30_000;

/**
 * Keep task state fresh while the app stays open.
 *
 * Two staleness sources: the calendar day rolling over past midnight (the
 * Today view is computed against the real-world day), and external writes to
 * the shared database — MCP agents can now add/start/complete tasks while the
 * app is in the background. A timer polls for the day change; regaining focus
 * or visibility always refreshes so agent changes appear as soon as the user
 * comes back to the window.
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

    function handleWindowActive() {
      if (document.visibilityState !== "visible") {
        return;
      }
      lastDayRef.current = toDateKey();
      void refresh();
    }

    const intervalId = window.setInterval(checkDayChange, CHECK_INTERVAL_MS);
    window.addEventListener("focus", handleWindowActive);
    document.addEventListener("visibilitychange", handleWindowActive);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowActive);
      document.removeEventListener("visibilitychange", handleWindowActive);
    };
  }, [refresh]);
}
