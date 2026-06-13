use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, Wry,
};

const TRAY_ID: &str = "yolo-status";

/// Handles to the tray menu items whose label / enabled / checked state the
/// frontend keeps in sync via `update_tray_menu`. The static items (Show,
/// Quick Add, Open My Day, Quit) never change, so we don't retain them.
struct TrayMenuItems {
    status: MenuItem<Wry>,
    toggle_focus: MenuItem<Wry>,
    reminders: CheckMenuItem<Wry>,
}

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
/// status line, the start/pause label, and the reminders checkbox truthful on
/// both macOS and Windows (the same menu backs both platforms).
#[tauri::command]
fn update_tray_menu(
    items: State<'_, TrayMenuItems>,
    status_label: String,
    focus_label: String,
    focus_enabled: bool,
    reminders_enabled: bool,
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

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Dynamic items kept in app state so `update_tray_menu` can mutate them.
            let status = MenuItem::with_id(app, "status", "No active focus", false, None::<&str>)?;
            let toggle_focus =
                MenuItem::with_id(app, "toggle_focus", "Start Focus", false, None::<&str>)?;
            let reminders =
                CheckMenuItem::with_id(app, "reminders", "Reminders", true, true, None::<&str>)?;

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
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some("Quit Yolo"))?,
                ],
            )?;

            app.manage(TrayMenuItems {
                status,
                toggle_focus,
                reminders,
            });

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
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }

            tray.build(app)?;
            Ok(())
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
            write_binary_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Yolo");
}
