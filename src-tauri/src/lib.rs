mod oauth;

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

// Window-material names. These are a contract with the web layer: they are
// returned by the `window_material` command and published to CSS as
// `<html data-material="…">` (see `src/utils/platform.ts`), where the glass
// surfaces key off them. Keep the two lists in sync.
const MATERIAL_NONE: &str = "none";
#[cfg(target_os = "macos")]
const MATERIAL_VIBRANCY: &str = "vibrancy";
#[cfg(target_os = "windows")]
const MATERIAL_MICA: &str = "mica";
#[cfg(target_os = "windows")]
const MATERIAL_ACRYLIC: &str = "acrylic";

/// Inset of the native macOS traffic-light buttons from the window's top-left,
/// in points.
///
/// The buttons are 14pt tall and sit in the app's own title bar, which is
/// `--titlebar-height` (40px) tall — see `TitleBar`. Centering them in that bar
/// gives y = (40 - 14) / 2 = 13. The x inset matches the shell's horizontal
/// gutter, so the lights line up with the sidebar content below them.
///
/// `TITLE_BAR_LEADING_INSET` in `src/components/layout/TitleBar.tsx` reserves
/// the matching space on the web side; change the two together.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHT_INSET_X: f64 = 20.0;
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHT_INSET_Y: f64 = 13.0;

/// Move the native window buttons (close/minimize/zoom) to the given inset from
/// the window's top-left corner. macOS re-lays these out on resize and
/// fullscreen transitions, so this must be re-applied on `Resized` events.
///
/// Takes the raw `NSWindow` pointer (from `WebviewWindow::ns_window`) so it can
/// be called from both setup and the window-event handler without juggling
/// Tauri window types.
#[cfg(target_os = "macos")]
#[allow(deprecated)] // `cocoa` crate is in maintenance; its API still works.
fn position_traffic_lights(ns_window_ptr: *mut std::ffi::c_void, x: f64, y: f64) {
    use cocoa::appkit::{NSWindow, NSWindowButton};
    use cocoa::foundation::{NSPoint, NSRect};
    use objc::runtime::Object;
    use objc::{msg_send, sel, sel_impl};

    type ObjcId = *mut Object;

    if ns_window_ptr.is_null() {
        return;
    }
    let ns_window = ns_window_ptr.cast::<Object>();

    // SAFETY: standard AppKit calls dispatched on the main thread (Tauri setup
    // and window events run there); every handle is null-checked before use.
    unsafe {
        let close: ObjcId = ns_window.standardWindowButton_(NSWindowButton::NSWindowCloseButton);
        let miniaturize: ObjcId =
            ns_window.standardWindowButton_(NSWindowButton::NSWindowMiniaturizeButton);
        let zoom: ObjcId = ns_window.standardWindowButton_(NSWindowButton::NSWindowZoomButton);
        if close.is_null() || miniaturize.is_null() || zoom.is_null() {
            return;
        }

        let container: ObjcId = msg_send![close, superview];
        if container.is_null() {
            return;
        }
        let container_frame: NSRect = msg_send![container, frame];
        let close_frame: NSRect = msg_send![close, frame];
        let miniaturize_frame: NSRect = msg_send![miniaturize, frame];

        // Preserve the native horizontal spacing between buttons; fall back to a
        // sane default if AppKit hasn't laid them out yet.
        let mut spacing = miniaturize_frame.origin.x - close_frame.origin.x;
        if spacing <= 0.0 {
            spacing = 20.0;
        }

        // Cocoa views use a bottom-left origin, so convert the requested inset
        // (measured from the top) into the container's coordinate space.
        let top_y = container_frame.size.height - y - close_frame.size.height;

        let _: () = msg_send![close, setFrameOrigin: NSPoint::new(x, top_y)];
        let _: () = msg_send![miniaturize, setFrameOrigin: NSPoint::new(x + spacing, top_y)];
        let _: () = msg_send![zoom, setFrameOrigin: NSPoint::new(x + spacing * 2.0, top_y)];
    }
}

/// Give the main window a real AppKit material so the app sits on live,
/// desktop-sampling glass rather than an opaque sheet.
///
/// `UnderWindowBackground` is the material macOS itself uses for a window's
/// background layer: it samples the wallpaper and windows *behind* Yolo, which
/// is the part CSS `backdrop-filter` fundamentally cannot do (that only ever
/// blurs Yolo's own content). The web layer then paints translucent panels on
/// top of it — see the `--glass-*` tokens in `src/styles.css`.
///
/// `FollowsWindowActiveState` makes the material desaturate when the window
/// loses key, matching every native app.
///
/// Deliberately *not* `apply_liquid_glass` (NSGlassEffectView, macOS 26+):
/// that view reparents the window's content view into itself, which would sit
/// between AppKit and the webview and disturb the traffic-light insetting and
/// drag regions. NSGlassEffectView is for discrete floating controls, not a
/// window background.
#[cfg(target_os = "macos")]
fn apply_main_window_material(app: &AppHandle) -> &'static str {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

    let Some(window) = app.get_webview_window("main") else {
        return MATERIAL_NONE;
    };
    match apply_vibrancy(
        &window,
        NSVisualEffectMaterial::UnderWindowBackground,
        Some(NSVisualEffectState::FollowsWindowActiveState),
        None,
    ) {
        Ok(()) => MATERIAL_VIBRANCY,
        Err(error) => {
            // Not fatal: the app is fully usable on an opaque background, so
            // log and carry on rather than failing startup.
            eprintln!("yolo: could not apply window vibrancy: {error}");
            MATERIAL_NONE
        }
    }
}

/// The Windows counterpart: Mica, falling back to Acrylic.
///
/// Mica is the Windows 11 window backdrop — it samples the desktop wallpaper
/// and tints with the system accent, which is the same "the window sits on
/// living material" idea as the macOS `UnderWindowBackground` vibrancy above.
/// It needs Windows 11 (build 22000+), so Windows 10 falls back to Acrylic,
/// which blurs what is behind the window instead.
///
/// Both can fail for ordinary reasons — an older build, or transparency turned
/// off in Settings → Personalization. The return value is what the web layer
/// reads through the `window_material` command, so the CSS glass surfaces can
/// render opaque rather than blurring nothing.
#[cfg(target_os = "windows")]
fn apply_main_window_material(app: &AppHandle) -> &'static str {
    use window_vibrancy::{apply_acrylic, apply_mica};

    let Some(window) = app.get_webview_window("main") else {
        return MATERIAL_NONE;
    };
    // `None` = let the system decide light/dark, so the material follows the
    // OS theme instead of pinning one and fighting our own dark mode.
    if apply_mica(&window, None).is_ok() {
        return MATERIAL_MICA;
    }
    match apply_acrylic(&window, None) {
        Ok(()) => MATERIAL_ACRYLIC,
        Err(error) => {
            eprintln!("yolo: could not apply window material: {error}");
            MATERIAL_NONE
        }
    }
}

/// Linux and anything else: no window material. The web layer paints an opaque
/// canvas, which is what `data-material="none"` already does everywhere else
/// the material is unavailable.
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn apply_main_window_material(_app: &AppHandle) -> &'static str {
    MATERIAL_NONE
}

/// Apply the traffic-light inset to the main window, if present. No-op when the
/// pointer can't be obtained.
#[cfg(target_os = "macos")]
fn apply_main_traffic_lights(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(ptr) = window.ns_window() {
            position_traffic_lights(ptr, TRAFFIC_LIGHT_INSET_X, TRAFFIC_LIGHT_INSET_Y);
        }
    }
}

/// Depth-first search for an `NSButton` (in practice the private
/// `NSStatusBarButton`) inside a status-bar window's view hierarchy.
#[cfg(target_os = "macos")]
fn find_ns_button(view: *mut objc::runtime::Object) -> *mut objc::runtime::Object {
    use objc::runtime::{Object, YES};
    use objc::{class, msg_send, sel, sel_impl};

    // SAFETY: AppKit calls on views we just obtained from AppKit itself; every
    // handle is null-checked before use, on the main thread (Tauri setup).
    unsafe {
        if view.is_null() {
            return std::ptr::null_mut();
        }
        let is_button: objc::runtime::BOOL = msg_send![view, isKindOfClass: class!(NSButton)];
        if is_button == YES {
            return view;
        }
        let subviews: *mut Object = msg_send![view, subviews];
        if subviews.is_null() {
            return std::ptr::null_mut();
        }
        let count: usize = msg_send![subviews, count];
        for index in 0..count {
            let child: *mut Object = msg_send![subviews, objectAtIndex: index];
            let found = find_ns_button(child);
            if !found.is_null() {
                return found;
            }
        }
        std::ptr::null_mut()
    }
}

/// Give the tray status item's button monospaced *digits* (the regular system
/// font otherwise renders digits proportionally), so the menu-bar timer keeps
/// a fixed width instead of jittering every second. This is what
/// `NSFont.monospacedDigitSystemFont` exists for; Tauri doesn't expose the
/// underlying `NSStatusItem`, so we locate our status-bar window among the
/// app's windows and set the font on its button directly. Fails soft: if
/// AppKit's private classes ever change, the timer just keeps the old font.
#[cfg(target_os = "macos")]
fn apply_tray_monospaced_digits() {
    use objc::runtime::{Class, Object, YES};
    use objc::{class, msg_send, sel, sel_impl};

    type ObjcId = *mut Object;

    // Private AppKit class backing status items; resolved at runtime so a
    // future rename degrades to "no font tweak" instead of a crash.
    let Some(status_window_class) = Class::get("NSStatusBarWindow") else {
        return;
    };

    // SAFETY: standard AppKit calls on the main thread (Tauri setup); every
    // handle is null-checked before use.
    unsafe {
        let ns_app: ObjcId = msg_send![class!(NSApplication), sharedApplication];
        let windows: ObjcId = msg_send![ns_app, windows];
        if windows.is_null() {
            return;
        }
        let count: usize = msg_send![windows, count];
        for index in 0..count {
            let window: ObjcId = msg_send![windows, objectAtIndex: index];
            let is_status: objc::runtime::BOOL =
                msg_send![window, isKindOfClass: status_window_class];
            if is_status != YES {
                continue;
            }
            let content: ObjcId = msg_send![window, contentView];
            let button = find_ns_button(content);
            if button.is_null() {
                continue;
            }
            // Match the menu bar's size but with fixed-width digits.
            let menu_bar_font: ObjcId = msg_send![class!(NSFont), menuBarFontOfSize: 0.0f64];
            let size: f64 = msg_send![menu_bar_font, pointSize];
            let font: ObjcId =
                msg_send![class!(NSFont), monospacedDigitSystemFontOfSize: size weight: 0.0f64];
            if !font.is_null() {
                let _: () = msg_send![button, setFont: font];
            }
        }
    }
}

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

/// The window material that actually got applied at startup, for the web layer
/// to read back through `window_material`.
struct AppliedMaterial(&'static str);

/// Report the window material behind the webview.
///
/// The frontend guesses optimistically from the platform so the first paint is
/// right, then calls this to replace the guess with the truth — applying Mica
/// or vibrancy can fail, and glass surfaces must fall back to opaque when it
/// does rather than blurring an opaque background.
#[tauri::command]
fn window_material(state: State<AppliedMaterial>) -> &'static str {
    state.0
}

#[tauri::command]
fn update_tray_status(app: AppHandle, title: Option<String>, tooltip: String) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "Yolo tray icon was not initialized".to_string())?;

    // Windows does not display tray titles, but macOS shows this in the menu bar.
    // On macOS the status item has no icon (see setup), so the title *is* the
    // item — fall back to the app name when idle or it would vanish entirely.
    #[cfg(target_os = "macos")]
    let title = title.or_else(|| Some("Yolo".to_string()));

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

    // Cover the monitor the app lives on — that is where the user is working —
    // and fall back to the primary one when it can't be determined.
    let monitor = app
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
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
///
/// Race guard: a new notification can be staged while the window is still
/// animating the old one out. `notification_id` says which notification the
/// window is closing; if the staged payload is a *newer* one, closing would
/// silently drop it — keep the window and re-show that payload instead.
#[tauri::command]
fn close_notification_window(
    app: AppHandle,
    payloads: State<'_, NotificationPayloads>,
    kind: String,
    notification_id: Option<String>,
) -> Result<(), String> {
    let label = notification_label(&kind)?;

    let newer_payload = {
        let mut map = payloads.0.lock().map_err(|error| error.to_string())?;
        match (map.get(label), notification_id.as_deref()) {
            (Some(staged), Some(id)) if staged.notification_id != id => Some(staged.clone()),
            _ => {
                map.remove(label);
                None
            }
        }
    };

    if let Some(payload) = newer_payload {
        app.emit_to(label, "notif://show", payload)
            .map_err(|error| error.to_string())?;
        return Ok(());
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
            app.manage(oauth::OauthListeners::default());

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

            // macOS: text-only status item to keep the menu bar compact — the
            // title carries the timer while focusing and the app name when
            // idle (kept truthful by `update_tray_status`). No icon at all.
            #[cfg(target_os = "macos")]
            {
                tray = tray.title("Yolo");
            }

            // Windows/Linux don't render tray titles, so the icon is the item.
            #[cfg(not(target_os = "macos"))]
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }

            tray.build(app)?;

            // The status item's window exists now; pin its button to
            // monospaced digits so the timer title doesn't jitter.
            #[cfg(target_os = "macos")]
            apply_tray_monospaced_digits();

            // Material first, then the button insets: applying it touches the
            // window's view hierarchy, so the lights are positioned after it
            // has settled.
            app.manage(AppliedMaterial(apply_main_window_material(&app.handle())));

            // Inset the native traffic lights so they sit inside the floating
            // sidebar (macOS only). Re-applied on resize in `on_window_event`.
            #[cfg(target_os = "macos")]
            apply_main_traffic_lights(&app.handle());

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
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    if window.label() == "main" {
                        let app = window.app_handle();
                        let quitting = app.state::<Quitting>().0.load(Ordering::SeqCst);
                        if !quitting {
                            let _ = window.hide();
                            api.prevent_close();
                        }
                    }
                }
                // macOS resets the native button layout on resize/fullscreen, so
                // re-apply our inset to keep the lights inside the sidebar.
                #[cfg(target_os = "macos")]
                WindowEvent::Resized(_) => {
                    if window.label() == "main" {
                        apply_main_traffic_lights(&window.app_handle());
                    }
                }
                _ => {}
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
            close_notification_window,
            window_material,
            oauth::oauth_start,
            oauth::oauth_wait,
            oauth::oauth_cancel
        ])
        .run(tauri::generate_context!())
        .expect("error while running Yolo");
}
