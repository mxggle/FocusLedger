# Notification Styles — Design

**Date:** 2026-06-13
**Status:** Approved (open decisions delegated to implementer)

## Goal

Let the user choose how task reminders reach them, from three styles:

1. **System Notification** — native macOS Notification Center (already wired via
   `@tauri-apps/plugin-notification`).
2. **Small Pop-up** — a small borderless window anchored near the menu-bar icon,
   reusing the existing toast content + action buttons.
3. **Full Screen** — an always-on-top overlay covering the screen ("time's up —
   continue or take another action").

One global style applies to all reminder types. Selectable from **both**
Settings → Desktop behavior and a tray submenu.

## Decisions

- **Close-to-tray:** the red close button hides the main window (app keeps
  running in the tray). `Cmd+Q` (bound to a custom tray "Quit Yolo" item) and the
  tray Quit item fully exit. Required so popup/fullscreen work when the window is
  "closed" — the hidden main webview remains the single source of truth.
- **Focus rule:**
  - `system` / `popup` fire only when the app is **not** focused (the in-app
    toast already covers the focused case — no double-alert).
  - `fullscreen` **always** interrupts, even while the app is focused, and
    replaces the in-app toast for that reminder (it carries the same actions).

## Architecture

JS only runs inside a webview, so the **main webview owns all logic** (task
store, reminder loop, settings, the action registry). Popup and fullscreen are
**view-only** auxiliary windows: they render a serialized payload and emit button
clicks back to main.

### Frontend (`src/notify/`)

- `types.ts` — `NotifyStyle`, `NotifyAction` (serializable: `actionId`, `label`,
  `variant`), `NotifyPayload`, and event channel constants
  (`notif://show`, `notif://action`, `notif://dismiss`).
- `notifyCenter.ts` — runs in the **main** webview:
  - `ensureNotifyCenter()` — registers (once) listeners for `notif://action` and
    `notif://dismiss`.
  - `showStyledNotification(style, { kind, title, description, actions })` —
    generates a `notificationId`, maps each action's `onClick` closure into a
    module registry keyed by `actionId`, serializes the rest, and invokes the
    Rust `show_notification_window` command.
  - On `notif://action {notificationId, actionId}` it looks up and runs the
    matching closure (the real store logic), then drops the registry entry.
- `NotificationWindow.tsx` — runs in the **aux** windows. On mount it pulls the
  pending payload (`take_notification_payload`), listens for `notif://show`
  updates, renders the popup or fullscreen view, and emits `notif://action` /
  `notif://dismiss`, then closes itself via `close_notification_window`.

### Window bootstrap (`main.tsx`)

Read the current window label. `main` → render `<App/>` (full app). `popup` /
`fullscreen` → render `<NotificationWindow role=.../>` only (no DB, no stores).

### Reminders (`useTaskReminders.ts`)

`notifyOnce` reads the current `notificationStyle`:
- `fullscreen` → `showStyledNotification("fullscreen", …)` always; skip toast.
- otherwise → in-app toast as today; when unfocused, `popup` →
  `showStyledNotification("popup", …)`, `system` → existing `sendNotification`.
- Any aux-window failure falls back to the system banner so an alert still lands.

### Settings

- New `notificationStyle: "system" | "popup" | "fullscreen"` (default `system`)
  in `types/settings.ts` + `DEFAULT_SETTINGS`. `settingsRepository.getAll` merges
  over defaults, so no DB migration is required.
- Settings → Desktop behavior gains a "Notification style" dropdown.
- The "Send test" button previews the **selected** style on demand.

### Rust (`lib.rs`)

- State `NotificationPayloads(Mutex<HashMap<String, NotifyPayload>>)` and
  `Quitting(AtomicBool)`.
- Commands: `show_notification_window(kind, payload)`,
  `take_notification_payload(label)`, `close_notification_window(kind)`.
  `show_…` builds-or-reuses a borderless, always-on-top window — popup sized
  ~380×200 anchored top-right; fullscreen sized to the monitor at its origin —
  stores the payload, and emits `notif://show` on reuse.
- `on_window_event`: main `CloseRequested` → hide + `prevent_close` unless
  quitting.
- Tray: a "Notification Style" submenu of three `CheckMenuItem`s; selecting one
  emits `tray://set-notification-style` with the value. A custom "Quit Yolo"
  item (accelerator `CmdOrControl+Q`) sets the quit flag and exits.
- `update_tray_menu` gains a `notification_style` arg to keep the radio checks
  truthful.

### Capabilities

New `capabilities/notification.json` for windows `["popup","fullscreen"]`
granting `core:default`, `core:event:default`, and the window
close/show/hide/focus/start-dragging permissions. App-defined commands are not
ACL-gated, so only the core event/window perms are needed.

## Lifecycle & edge cases

- Single popup and single fullscreen window, reused; latest notification wins.
- Popup auto-dismisses after ~20s or on action; fullscreen stays until acted on.
- Popup positioning is best-effort (top-right under the menu bar).
- Aux windows derive dark mode from `prefers-color-scheme` (no settings access).

## Testing

- **Vitest:** payload serialization (no closures leak; actions become
  id+label+variant), style→channel routing, settings default.
- **Component:** Settings dropdown; popup/fullscreen views render actions from a
  payload and emit the right events.
- **Manual (Tauri):** `yarn tauri dev` + the "Send test" button to preview each
  style; verify close-to-tray keeps the app alive and `Cmd+Q`/tray Quit exits.
