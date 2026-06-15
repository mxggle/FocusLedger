import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createId } from "../utils/id";
import {
  NOTIFY_ACTION_EVENT,
  NOTIFY_DISMISS_EVENT,
  type NotifyActionEvent,
  type NotifyDismissEvent,
  type NotifyKind,
  type NotifyPayload,
  type NotifyVariant,
  type NotifyWindowKind
} from "./types";

/**
 * The notification center lives in the MAIN webview. It dispatches fullscreen
 * notifications (which render in a separate window) and routes their button
 * clicks back to the real handlers here, since the action closures can't cross
 * the window boundary — only ids do.
 */

type LiveAction = { onClick: () => void | Promise<unknown> };

/** notificationId → (actionId → handler). Holds only the live notifications. */
const registry = new Map<string, Map<string, LiveAction>>();
let listenersReady = false;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Register the action/dismiss listeners exactly once. Safe to call repeatedly
 * (e.g. from multiple hooks); only the first call wires up the listeners.
 */
export async function ensureNotifyCenter(): Promise<void> {
  if (!isTauriRuntime() || listenersReady) {
    return;
  }
  listenersReady = true;

  await listen<NotifyActionEvent>(NOTIFY_ACTION_EVENT, (event) => {
    const { notificationId, actionId } = event.payload;
    const action = registry.get(notificationId)?.get(actionId);
    registry.delete(notificationId);
    void action?.onClick();
  });

  await listen<NotifyDismissEvent>(NOTIFY_DISMISS_EVENT, (event) => {
    registry.delete(event.payload.notificationId);
  });
}

export type StyledAction = {
  label: string;
  variant?: NotifyVariant;
  onClick: () => void | Promise<unknown>;
};

export type StyledNotification = {
  kind?: NotifyKind;
  title: string;
  description: string;
  actions?: StyledAction[];
};

/**
 * Show a notification in the fullscreen window. The action closures are kept in
 * the local registry and invoked when the aux window reports a click. Throws if
 * the window could not be shown so callers can fall back.
 */
export async function showStyledNotification(
  style: NotifyWindowKind,
  notification: StyledNotification
): Promise<void> {
  const notificationId = createId("notif");
  const actionMap = new Map<string, LiveAction>();

  const actions = (notification.actions ?? []).map((action, index) => {
    const actionId = `a${index}`;
    actionMap.set(actionId, { onClick: action.onClick });
    return { actionId, label: action.label, variant: action.variant };
  });

  registry.set(notificationId, actionMap);

  const payload: NotifyPayload = {
    notificationId,
    kind: notification.kind ?? "info",
    title: notification.title,
    description: notification.description,
    actions
  };

  try {
    await invoke("show_notification_window", { kind: style, payload });
  } catch (error) {
    registry.delete(notificationId);
    throw error;
  }
}
