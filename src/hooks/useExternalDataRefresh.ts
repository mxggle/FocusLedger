import { useEffect, useRef } from "react";
import { readTaskDataChangeToken } from "../db/changeToken";
import { useTaskStore } from "../stores/taskStore";

const CHECK_INTERVAL_MS = 1_000;

/**
 * Keep the in-memory task store in sync with out-of-process database writes.
 * MCP tools mutate the same SQLite file directly, bypassing Zustand actions,
 * so the app needs a cheap invalidation check while it is open.
 */
export function useExternalDataRefresh(): void {
  const initialized = useTaskStore((state) => state.initialized);
  const refresh = useTaskStore((state) => state.refresh);
  const lastTokenRef = useRef<string | null>(null);
  const checkInFlightRef = useRef(false);

  useEffect(() => {
    if (!initialized) {
      lastTokenRef.current = null;
      return;
    }

    let disposed = false;

    async function checkForChanges() {
      if (checkInFlightRef.current) {
        return;
      }

      checkInFlightRef.current = true;
      try {
        const token = await readTaskDataChangeToken();
        if (disposed) {
          return;
        }
        if (lastTokenRef.current === null) {
          lastTokenRef.current = token;
          return;
        }
        if (token === lastTokenRef.current) {
          return;
        }

        await refresh();
        if (!disposed) {
          lastTokenRef.current = await readTaskDataChangeToken();
        }
      } catch (error) {
        console.warn("Task data change check failed", error);
      } finally {
        checkInFlightRef.current = false;
      }
    }

    void checkForChanges();
    const intervalId = window.setInterval(() => {
      void checkForChanges();
    }, CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [initialized, refresh]);
}
