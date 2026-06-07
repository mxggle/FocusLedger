import { useCallback, useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";
import { useUiStore } from "../stores/uiStore";
import {
  canOpenSystemNotificationSettings,
  getNotificationPermission,
  openSystemNotificationSettings,
  requestNotificationPermission,
  type NotificationPermissionStatus
} from "../utils/notificationPermission";

export type NotificationPermissionApi = {
  status: NotificationPermissionStatus;
  canOpenSettings: boolean;
  request: () => Promise<NotificationPermissionStatus>;
  openSettings: () => Promise<boolean>;
  refresh: () => Promise<NotificationPermissionStatus>;
};

/**
 * Track the OS notification permission and expose actions to request it or jump
 * to the relevant system settings. Pure: it shows no toasts and triggers no
 * automatic prompts, so it is safe to use from any component (e.g. settings).
 */
export function useNotificationPermission(): NotificationPermissionApi {
  const [status, setStatus] = useState<NotificationPermissionStatus>("default");

  const refresh = useCallback(async () => {
    const next = await getNotificationPermission();
    setStatus(next);
    return next;
  }, []);

  const request = useCallback(async () => {
    const next = await requestNotificationPermission();
    setStatus(next);
    return next;
  }, []);

  const openSettings = useCallback(() => openSystemNotificationSettings(), []);

  useEffect(() => {
    void refresh();

    // Permission can change in OS settings while the app stays open (e.g. the
    // user just clicked "Open settings"). Re-read it whenever the window regains
    // focus so the indicator reflects reality without a restart.
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return {
    status,
    canOpenSettings: canOpenSystemNotificationSettings(),
    request,
    openSettings,
    refresh
  };
}

/**
 * App-level startup flow: when notifications are enabled, ask the OS for
 * permission once. If it is not granted, surface a persistent toast with a
 * one-click shortcut to the system settings so the user can fix it.
 *
 * Use this exactly once (in App) — it owns the user-facing prompt. Other places
 * should use useNotificationPermission().
 */
export function useNotificationPermissionPrompt(): NotificationPermissionApi {
  const api = useNotificationPermission();
  const enableNotifications = useSettingsStore((state) => state.settings.enableNotifications);
  const initialized = useTaskStore((state) => state.initialized);
  const addToast = useUiStore((state) => state.addToast);
  const dismissToast = useUiStore((state) => state.dismissToast);
  const promptedRef = useRef(false);
  const toastIdRef = useRef<string | null>(null);

  const { status, request, openSettings, canOpenSettings } = api;

  useEffect(() => {
    if (!enableNotifications || !initialized || promptedRef.current) {
      return;
    }
    promptedRef.current = true;

    void (async () => {
      const result = await request();
      if (result === "granted") {
        return;
      }

      toastIdRef.current =
        addToast({
          kind: "error",
          title: "Turn on notifications",
          description:
            "Yolo can't alert you when a task reaches its planned time. Allow notifications to get reminders.",
          durationMs: 0,
          actions: canOpenSettings
            ? [
                {
                  label: "Open settings",
                  variant: "primary",
                  onClick: () => void openSettings()
                }
              ]
            : undefined
        }) ?? null;
    })();
  }, [addToast, canOpenSettings, enableNotifications, initialized, openSettings, request]);

  // Once the user grants permission (here, in Settings, or via the OS), clear
  // the sticky prompt so it doesn't keep nagging after the problem is fixed.
  useEffect(() => {
    if (status === "granted" && toastIdRef.current) {
      dismissToast(toastIdRef.current);
      toastIdRef.current = null;
    }
  }, [status, dismissToast]);

  return api;
}
