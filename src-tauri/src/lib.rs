use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl,
    WebviewWindowBuilder, WindowEvent, Wry,
};

const TRAY_ID: &str = "yolo-status";

/// How often the native heartbeat nudges the webview to re-evaluate reminders.
/// Kept below the JS tick so a throttled webview timer never sets the cadence.
const REMINDER_HEARTBEAT_SECS: u64 = 20;

/// Handles to the tray menu items whose label / enabled / checked state the
/// frontend keeps in sync via `update_tray_menu`. The static items (Show,
/// Quick Add, Open My Day, Quit) never change, so we don't retain them.
struct TrayMenuItems {
    status: MenuItem<Wry>,
    toggle_focus: MenuItem<Wry>,
    reminders: CheckMenuItem<Wry>,
    style_system: CheckMenuItem<Wry>,
    style_fullscreen: CheckMenuItem<Wry>,
}

/// Serializable notification shown in the fullscreen window. Mirrors
/// the frontend `NotifyPayload` — no behavior crosses the window boundary, only
/// action ids the aux window reports back.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct NotifyAction {
    #[serde(rename = "actionId")]
    action_id: String,
    label: String,
    #[serde(default)]
    variant: Option<String>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct NotifyPayload {
    #[serde(rename = "notificationId")]
    notification_id: String,
    kind: String,
    title: String,
    description: String,
    actions: Vec<NotifyAction>,
}

/// Payload staged by the main webview for an aux window to pick up on mount.
/// Keyed by window label ("fullscreen").
struct NotificationPayloads(Mutex<HashMap<String, NotifyPayload>>);

/// Set just before a real quit so the close-to-tray handler doesn't swallow it.
struct Quitting(AtomicBool);

#[tauri::command]
fn update_tray_status(app: AppHandle, title: Option<String>, tooltip: String) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "Yolo tray icon was not initialized".to_string())?;

    // Windows does not display tray titles, but macOS shows this in the menu bar.
    tray.set_title(title.as_deref()).map_err(|error| error.to_string())?;
    tray.set_tooltip(Some(tooltip)).map_err(|error| error.to_string())
}

/// Push the frontend's view of focus state into the tray menu. Keeps the
/// status line, the start/pause label, the reminders checkbox, and the
/// notification-style radio truthful on both macOS and Windows.
#[tauri::command]
fn update_tray_menu(
    items: State<'_, TrayMenuItems>,
    status_label: String,
    focus_label: String,
    focus_enabled: bool,
    reminders_enabled: bool,
    notification_style: String,
) -> Result<(), String> {
    items.status.set_text(status_label).map_err(|error| error.to_string())?;
    items.toggle_focus.set_text(focus_label).map_err(|error| error.to_string())?;
    items
        .toggle_focus
        .set_enabled(focus_enabled)
        .map_err(|error| error.to_string())?;
    items
        .reminders
        .set_checked(reminders_enabled)
        .map_err(|error| error.to_string())?;
    items
        .style_system
        .set_checked(notification_style == "system")
        .map_err(|error| error.to_string())?;
    items
        .style_fullscreen
        .set_checked(notification_style == "fullscreen")
        .map_err(|error| error.to_string())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Bring the main window to the foreground. Exposed so a notification click (and
/// any other JS-side trigger) can reuse the exact path the tray "Show" uses,
/// which reliably activates the app on macOS.
#[tauri::command]
fn focus_main_window(app: AppHandle) {
    show_main_window(&app);
}

/// Writes raw bytes to an absolute path the user already chose via the save
/// dialog. Keeping this in Rust avoids the fs-plugin path-scope dance for a
/// one-shot "export image to where the user picked" flow.
#[tauri::command]
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &contents).map_err(|error| error.to_string())
}

/// Resolve a notification window kind ("fullscreen") to its label, rejecting
/// anything else so we never create stray windows.
fn notification_label(kind: &str) -> Result<&'static str, String> {
    match kind {
        "fullscreen" => Ok("fullscreen"),
        other => Err(format!("unknown notification window kind: {other}")),
    }
}

/// Show (creating if needed) the fullscreen notification window with the given
/// payload. The window is borderless and always-on-top; the payload is staged
/// so the freshly created webview can pull it on mount, and also emitted so an
/// already-open window updates in place.
#[tauri::command]
fn show_notification_window(
    app: AppHandle,
    payloads: State<'_, NotificationPayloads>,
    kind: String,
    payload: NotifyPayload,
) -> Result<(), String> {
    let label = notification_label(&kind)?;

    payloads
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .insert(label.to_string(), payload.clone());

    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        // The fullscreen overlay is a deliberate interrupt and should come forward.
        let _ = window.set_focus();
        app.emit_to(label, "notif://show", payload)
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    // Build hidden, finish sizing while hidden, and let the webview reveal
    // itself once it has painted a transparent frame (see
    // `reveal_notification_window`). Showing a transparent webview before its
    // first paint flashes the opaque page background across the whole screen —
    // the same problem Electron solves with `show: false` + `ready-to-show`.
    let builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::App("index.html".into()))
        .title("Yolo")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        // Fullscreen: a transparent, borderless overlay sized to the monitor
        // (set below, while still hidden, so there is no visible size jump).
        .inner_size(800.0, 600.0)
        .transparent(true)
        .shadow(false);

    let window = builder.build().map_err(|error| error.to_string())?;

    if let Ok(Some(monitor)) = window.primary_monitor() {
        let size = monitor.size();
        let position = monitor.position();
        let _ = window.set_position(PhysicalPosition::new(position.x as f64, position.y as f64));
        let _ = window.set_size(PhysicalSize::new(size.width as f64, size.height as f64));
    }

    Ok(())
}

/// Hand the staged payload to an aux window that just mounted.
#[tauri::command]
fn take_notification_payload(
    payloads: State<'_, NotificationPayloads>,
    label: String,
) -> Option<NotifyPayload> {
    payloads.0.lock().ok()?.get(&label).cloned()
}

/// Reveal a notification window once its webview has painted a transparent
/// frame. Created hidden (see `show_notification_window`) to avoid an opaque
/// background flash; the frontend calls this after its first paint.
#[tauri::command]
fn reveal_notification_window(app: AppHandle, kind: String) -> Result<(), String> {
    let label = notification_label(&kind)?;
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        // The fullscreen overlay is a deliberate interrupt and comes forward.
        let _ = window.set_focus();
    }
    Ok(())
}

/// Close the fullscreen notification window and drop its payload.
#[tauri::command]
fn close_notification_window(
    app: AppHandle,
    payloads: State<'_, NotificationPayloads>,
    kind: String,
) -> Result<(), String> {
    let label = notification_label(&kind)?;
    if let Ok(mut map) = payloads.0.lock() {
        map.remove(label);
    }
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Dynamic items kept in app state so `update_tray_menu` can mutate them.
            let status = MenuItem::with_id(app, "status", "No active focus", false, None::<&str>)?;
            let toggle_focus =
                MenuItem::with_id(app, "toggle_focus", "Start Focus", false, None::<&str>)?;
            let reminders =
                CheckMenuItem::with_id(app, "reminders", "Reminders", true, true, None::<&str>)?;

            // Notification-style radio group (mirrors Settings; one is checked).
            let style_system = CheckMenuItem::with_id(
                app,
                "style_system",
                "System Notification",
                true,
                true,
                None::<&str>,
            )?;
            let style_fullscreen = CheckMenuItem::with_id(
                app,
                "style_fullscreen",
                "Full Screen",
                true,
                false,
                None::<&str>,
            )?;
            let style_menu = Submenu::with_items(
                app,
                "Notification Style",
                true,
                &[&style_system, &style_fullscreen],
            )?;

            let quit = MenuItem::with_id(app, "quit", "Quit Yolo", true, Some("CmdOrControl+Q"))?;

            let menu = Menu::with_items(
                app,
                &[
                    &status,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "show", "Show Yolo", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quick_add", "Quick Add Task", true, None::<&str>)?,
                    &toggle_focus,
                    &MenuItem::with_id(app, "open_my_day", "Open My Day", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &reminders,
                    &style_menu,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ],
            )?;

            app.manage(TrayMenuItems {
                status,
                toggle_focus,
                reminders,
                style_system,
                style_fullscreen,
            });
            app.manage(NotificationPayloads(Mutex::new(HashMap::new())));
            app.manage(Quitting(AtomicBool::new(false)));

            // Left-click opens the dropdown menu on both platforms; the window
            // is reached via the menu's "Show Yolo" item.
            let mut tray = TrayIconBuilder::with_id(TRAY_ID)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("Yolo")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
                    "quick_add" => {
                        show_main_window(app);
                        let _ = app.emit("tray://quick-add", ());
                    }
                    "toggle_focus" => {
                        let _ = app.emit("tray://toggle-focus", ());
                    }
                    "open_my_day" => {
                        show_main_window(app);
                        let _ = app.emit("tray://open-my-day", ());
                    }
                    "reminders" => {
                        let _ = app.emit("tray://toggle-reminders", ());
                    }
                    "style_system" => {
                        let _ = app.emit("tray://set-notification-style", "system");
                    }
                    "style_fullscreen" => {
                        let _ = app.emit("tray://set-notification-style", "fullscreen");
                    }
                    "quit" => {
                        app.state::<Quitting>().0.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }

            tray.build(app)?;

            // The reminder engine lives in the main webview's JS, whose
            // setInterval is throttled or frozen while the window is hidden to
            // the tray (WebKit hidden-page throttling + macOS App Nap, the
            // latter disabled via Info.plist). This native thread is immune to
            // that, so it nudges the webview to re-evaluate reminders on a
            // steady cadence even while Yolo is backgrounded — without it,
            // background reminders fire late or not at all.
            let heartbeat = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(REMINDER_HEARTBEAT_SECS));
                if heartbeat.emit("reminders://tick", ()).is_err() {
                    break;
                }
            });

            Ok(())
        })
        // Closing the main window hides it to the tray (the app keeps running so
        // reminders and the tray menu stay alive); a real quit sets the flag.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let app = window.app_handle();
                    let quitting = app.state::<Quitting>().0.load(Ordering::SeqCst);
                    if !quitting {
                        let _ = window.hide();
                        api.prevent_close();
                    }
                }
            }
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            update_tray_status,
            update_tray_menu,
            focus_main_window,
            write_binary_file,
            show_notification_window,
            take_notification_payload,
            reveal_notification_window,
            close_notification_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running Yolo");
}
