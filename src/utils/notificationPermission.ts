import { openExternal } from "./openExternal";

export type NotificationPermissionStatus = "granted" | "denied" | "default";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Read the current OS notification permission without prompting the user.
 *
 * The Tauri plugin only reports granted vs. not-granted, so any non-granted
 * state is reported as "default" here. Call requestNotificationPermission to get
 * a definitive granted/denied result (it prompts when the decision is pending).
 */
export async function getNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (isTauriRuntime()) {
    try {
      const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
      return (await isPermissionGranted()) ? "granted" : "default";
    } catch {
      return "default";
    }
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return window.Notification.permission as NotificationPermissionStatus;
}

/**
 * Request OS notification permission, prompting the user when the decision has
 * not yet been made. Returns the resulting status. If permission was previously
 * denied, the OS does not re-prompt and this resolves to "denied" — callers
 * should then direct the user to openSystemNotificationSettings().
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (isTauriRuntime()) {
    try {
      const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
      if (await isPermissionGranted()) {
        return "granted";
      }
      return (await requestPermission()) as NotificationPermissionStatus;
    } catch {
      return "denied";
    }
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (window.Notification.permission !== "default") {
    return window.Notification.permission as NotificationPermissionStatus;
  }
  return (await window.Notification.requestPermission()) as NotificationPermissionStatus;
}

export type TestNotificationResult = "sent" | "denied" | "unsupported";

/**
 * Send a one-off test notification so the user can confirm desktop banners
 * actually reach them. Requests permission first if needed. Returns "sent" when
 * the banner was dispatched, "denied" when the OS won't allow it, and
 * "unsupported" when notifications aren't available in this runtime.
 */
export async function sendTestNotification(): Promise<TestNotificationResult> {
  const title = "Yolo test notification";
  const body = "Notifications are working. This is what a reminder looks like.";

  if (isTauriRuntime()) {
    try {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        "@tauri-apps/plugin-notification"
      );
      const granted = (await isPermissionGranted()) || (await requestPermission()) === "granted";
      if (!granted) {
        return "denied";
      }
      sendNotification({ title, body });
      return "sent";
    } catch {
      return "unsupported";
    }
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  const permission =
    window.Notification.permission === "default"
      ? await window.Notification.requestPermission()
      : window.Notification.permission;
  if (permission !== "granted") {
    return "denied";
  }
  // eslint-disable-next-line no-new
  new window.Notification(title, { body });
  return "sent";
}

function systemNotificationSettingsUrl(): string | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) {
    return "x-apple.systempreferences:com.apple.preference.notifications";
  }
  if (/Win/i.test(ua)) {
    return "ms-settings:notifications";
  }
  // Linux desktops have no universal notification-settings deep link.
  return null;
}

/** Whether this platform exposes a deep link to its notification settings. */
export function canOpenSystemNotificationSettings(): boolean {
  return systemNotificationSettingsUrl() !== null;
}

/**
 * Deep-link to the OS location where notification permission is managed, so a
 * user who previously denied access can re-enable it. Returns false when the
 * platform has no known settings URI.
 */
export async function openSystemNotificationSettings(): Promise<boolean> {
  const url = systemNotificationSettingsUrl();
  if (!url) {
    return false;
  }
  await openExternal(url);
  return true;
}
