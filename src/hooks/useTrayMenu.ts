import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";
import { useTimerStore } from "../stores/timerStore";
import { useUiStore } from "../stores/uiStore";
import type { NotificationStyle } from "../types";
import { formatDurationCompact } from "../utils/duration";

const MY_DAY_ROUTE = "my-day";

function liveOpenSeconds(startAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(startAt).getTime()) / 1000));
}

/**
 * Keeps the dynamic tray-menu items in sync with focus state, and wires the
 * menu's action items back into the app. The same menu backs macOS and
 * Windows, so this covers both platforms.
 *
 * Listeners read fresh state via `getState()` so they can register once and
 * never go stale; the push effect re-runs whenever the displayed state changes.
 */
export function useTrayMenu() {
  const todayStats = useTaskStore((state) => state.todayStats);
  const activeEntry = useTaskStore((state) => state.activeEntry);
  const focusedTask = useTaskStore((state) => state.focusedTask);
  const now = useTimerStore((state) => state.now);
  const enableNotifications = useSettingsStore((state) => state.settings.enableNotifications);
  const notificationStyle = useSettingsStore((state) => state.settings.notificationStyle);

  // Push current state into the native menu.
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const openSeconds = activeEntry ? liveOpenSeconds(activeEntry.start_at, now) : 0;
    const focusedSeconds = (todayStats?.totalFocusSeconds ?? 0) + openSeconds;
    const statusLabel =
      focusedSeconds > 0 ? `Today · ${formatDurationCompact(focusedSeconds)} focused` : "No focus logged today";

    let focusLabel = "Start Focus";
    let focusEnabled = false;
    if (activeEntry) {
      focusLabel = "Pause Focus";
      focusEnabled = true;
    } else if (focusedTask?.status === "paused") {
      focusLabel = "Resume Focus";
      focusEnabled = true;
    }

    void invoke("update_tray_menu", {
      statusLabel,
      focusLabel,
      focusEnabled,
      remindersEnabled: enableNotifications,
      notificationStyle
    }).catch((error) => {
      console.warn("Tray menu could not be updated", error);
    });
  }, [todayStats, activeEntry, focusedTask, now, enableNotifications, notificationStyle]);

  // Wire menu actions back into the app (registered once).
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const unlisteners: Array<Promise<() => void>> = [
      listen("tray://quick-add", () => {
        useUiStore.getState().openQuickAdd();
      }),
      listen("tray://open-my-day", () => {
        useUiStore.getState().requestRoute(MY_DAY_ROUTE);
      }),
      listen("tray://toggle-focus", () => {
        const { activeEntry: active, focusedTask: focused, pauseActiveTask, resumeTask } = useTaskStore.getState();
        if (active) {
          void pauseActiveTask();
        } else if (focused?.status === "paused") {
          void resumeTask(focused.id);
        }
      }),
      listen("tray://toggle-reminders", () => {
        const { settings, updateSetting } = useSettingsStore.getState();
        void updateSetting("enableNotifications", !settings.enableNotifications);
      }),
      listen<NotificationStyle>("tray://set-notification-style", (event) => {
        useSettingsStore.getState().updateSetting("notificationStyle", event.payload);
      })
    ];

    return () => {
      for (const pending of unlisteners) {
        void pending.then((unlisten) => unlisten());
      }
    };
  }, []);
}
