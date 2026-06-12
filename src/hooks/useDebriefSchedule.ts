import { useEffect, useRef } from "react";
import { debriefRepository } from "../db/debriefRepository";
import { hasAiKey } from "../services/ai/aiClient";
import { runTodayDebrief, shouldRunAutoDebrief } from "../services/ai/debriefRunner";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";
import { useUiStore } from "../stores/uiStore";
import { toDateKey } from "../utils/date";

const CHECK_INTERVAL_MS = 30_000;

/**
 * Runs the daily debrief automatically at the user-chosen time, then offers a
 * toast to view it. Fires at most once per day (per app session for failures —
 * a failing provider shouldn't be retried every 30 seconds), and skips days
 * where a debrief already exists so a manual run is never overwritten.
 */
export function useDebriefSchedule() {
  // `YYYY-MM-DD` of the last day we kicked off (or finished checking) a run.
  const attemptedDateRef = useRef<string | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    async function check() {
      if (runningRef.current) return;

      const settings = useSettingsStore.getState().settings;
      const { initialized, todayEntries } = useTaskStore.getState();
      if (!initialized || !settings.debriefAutoEnabled) return;

      const now = new Date();
      const today = toDateKey(now);

      const gate = shouldRunAutoDebrief({
        enabled: settings.debriefAutoEnabled,
        time: settings.debriefAutoTime,
        now,
        hasKey: hasAiKey(settings),
        hasEntries: todayEntries.length > 0,
        alreadyGenerated: false, // checked against the DB below
        alreadyAttempted: attemptedDateRef.current === today
      });
      if (!gate) return;

      runningRef.current = true;
      try {
        const existing = await debriefRepository.getForDate(today);
        if (existing) {
          // Manual debrief already saved today — don't overwrite it.
          attemptedDateRef.current = today;
          return;
        }

        attemptedDateRef.current = today;
        await runTodayDebrief(now);

        useUiStore.getState().addToast({
          kind: "success",
          title: "Your daily debrief is ready",
          description: "A short read on where today actually went.",
          durationMs: 15_000,
          actions: [
            {
              label: "View",
              variant: "primary",
              onClick: () => useUiStore.getState().setDebriefDialogOpen(true)
            }
          ]
        });
      } catch (error) {
        console.error("Scheduled debrief failed", error);
        useUiStore.getState().addToast({
          kind: "error",
          title: "Scheduled debrief failed",
          description: error instanceof Error ? error.message : "Unknown AI error"
        });
      } finally {
        runningRef.current = false;
      }
    }

    void check();
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);
}
