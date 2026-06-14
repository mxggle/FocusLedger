/**
 * Shared types and event channels for the multi-window notification system.
 *
 * The main webview owns all logic; the popup/fullscreen windows are view-only
 * and exchange data with main exclusively through these serializable payloads
 * and events. No closures ever cross the window boundary.
 */

export type NotifyStyle = "system" | "popup" | "fullscreen";

/** Aux windows that render a styled notification. */
export type NotifyWindowKind = "popup" | "fullscreen";

export type NotifyKind = "info" | "success" | "error";

export type NotifyVariant = "primary" | "secondary" | "ghost" | "danger";

/** A button as seen by the aux window — no behavior, just an id to report back. */
export type NotifyAction = {
  actionId: string;
  label: string;
  variant?: NotifyVariant;
};

export type NotifyPayload = {
  notificationId: string;
  kind: NotifyKind;
  title: string;
  description: string;
  actions: NotifyAction[];
};

/** Rust → aux window: render/refresh this payload (covers window reuse). */
export const NOTIFY_SHOW_EVENT = "notif://show";
/** Aux window → main: the user pressed an action button. */
export const NOTIFY_ACTION_EVENT = "notif://action";
/** Aux window → main: the notification was dismissed without an action. */
export const NOTIFY_DISMISS_EVENT = "notif://dismiss";

export type NotifyActionEvent = { notificationId: string; actionId: string };
export type NotifyDismissEvent = { notificationId: string };
