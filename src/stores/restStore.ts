import { create } from "zustand";
import { restSessionRepository } from "../db/restSessionRepository";
import type { RestSession, RestTrigger } from "../types";
import { decideAfterTaskRest } from "./restDecision";
import { formatDurationCompact } from "../utils/duration";
import { toDateKey } from "../utils/date";
import { CELEBRATION_MS } from "../utils/motion";
import { useSettingsStore } from "./settingsStore";
import { useTaskStore } from "./taskStore";
import { useTimerStore } from "./timerStore";
import { useUiStore } from "./uiStore";

/** The live rest in progress. `plannedSeconds` is a soft target for the
 *  countdown ring; the recorded length always comes from start/end on close. */
type ActiveRest = {
  id: string;
  startedAt: string;
  plannedSeconds: number;
  trigger: RestTrigger;
};

type RestState = {
  rest: ActiveRest | null;
  todayRestSessions: RestSession[];
  /** Load today's rest markers and resume an in-progress rest after a reopen. */
  hydrate: () => Promise<void>;
  refreshToday: () => Promise<void>;
  startRest: (opts?: { minutes?: number; trigger?: RestTrigger }) => Promise<void>;
  extendRest: (minutes: number) => void;
  endRest: () => Promise<void>;
  /** Decide whether to offer/start a break after a finished focus session. */
  maybeAutoRestAfter: (focusSeconds: number) => void;
};

export const useRestStore = create<RestState>((set, get) => ({
  rest: null,
  todayRestSessions: [],

  hydrate: async () => {
    try {
      const resumable = await restSessionRepository.repairActive();
      if (resumable) {
        const planned = useSettingsStore.getState().settings.restDefaultMinutes * 60;
        set({
          rest: {
            id: resumable.id,
            startedAt: resumable.start_at,
            plannedSeconds: planned,
            trigger: resumable.trigger
          }
        });
        useTimerStore.getState().startTicker();
      }
      await get().refreshToday();
    } catch (error) {
      console.error("Failed to hydrate rest sessions", error);
    }
  },

  refreshToday: async () => {
    try {
      const todayRestSessions = await restSessionRepository.getForDate(toDateKey());
      set({ todayRestSessions });
    } catch (error) {
      console.error("Failed to load rest sessions", error);
    }
  },

  startRest: async (opts = {}) => {
    if (get().rest) return; // already resting
    const settings = useSettingsStore.getState().settings;
    if (!settings.restEnabled) return;

    try {
      // Rest and focus are mutually exclusive — pause anything running first so
      // its clock stops while you step away.
      const taskStore = useTaskStore.getState();
      if (taskStore.activeEntry) {
        await taskStore.pauseActiveTask();
      }

      const trigger = opts.trigger ?? "manual";
      const minutes = opts.minutes ?? settings.restDefaultMinutes;
      const session = await restSessionRepository.open(trigger);
      set({
        rest: {
          id: session.id,
          startedAt: session.start_at,
          plannedSeconds: Math.max(60, Math.round(minutes * 60)),
          trigger
        }
      });
      useTimerStore.getState().startTicker();
      await get().refreshToday();
    } catch (error) {
      console.error("Failed to start rest", error);
      useUiStore.getState().addToast({
        kind: "error",
        title: "Could not start rest",
        description: error instanceof Error ? error.message : "Unknown error"
      });
    }
  },

  extendRest: (minutes) => {
    const rest = get().rest;
    if (!rest) return;
    set({ rest: { ...rest, plannedSeconds: rest.plannedSeconds + Math.round(minutes * 60) } });
  },

  endRest: async () => {
    const rest = get().rest;
    if (!rest) return;
    set({ rest: null });
    try {
      await restSessionRepository.close(rest.id);
      // Only stop the global ticker if no focus session is keeping it alive.
      if (!useTaskStore.getState().activeEntry) {
        useTimerStore.getState().stopTicker();
      }
      await get().refreshToday();
    } catch (error) {
      console.error("Failed to end rest", error);
    }
  },

  maybeAutoRestAfter: (focusSeconds) => {
    const settings = useSettingsStore.getState().settings;
    const decision = decideAfterTaskRest(settings, focusSeconds, Boolean(get().rest));
    if (decision === "none") return;

    if (decision === "auto") {
      // Let the "done" celebration finish before the rest screen takes over.
      window.setTimeout(() => {
        void useRestStore.getState().startRest({ trigger: "auto" });
      }, CELEBRATION_MS);
      return;
    }

    // "ask" — a quiet, non-blocking offer the user can take or ignore.
    useUiStore.getState().addToast({
      kind: "info",
      title: "Nice work — take a break?",
      description: `You focused for ${formatDurationCompact(focusSeconds)}.`,
      actions: [
        {
          label: `Rest ${settings.restDefaultMinutes} min`,
          variant: "primary",
          onClick: () => useRestStore.getState().startRest({ trigger: "auto" })
        }
      ]
    });
  }
}));

/** Live elapsed seconds for the active rest, given the timer's `now`. */
export function getRestElapsedSeconds(rest: ActiveRest | null, now: Date): number {
  if (!rest) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(rest.startedAt).getTime()) / 1000));
}
