import { usesCustomWindowControls } from "../../utils/platform";
import { WindowControls } from "./WindowControls";

/**
 * The window's own chrome, floating above the entire app.
 *
 * On macOS the traffic lights are AppKit views: they sit *above* the webview,
 * so a full-screen web overlay can never hide them and the user can always
 * close the window. Windows has no such guarantee — the caption buttons are
 * ours, drawn in the page — so anything rendered at a higher stacking level
 * would trap the user in a window they cannot close or minimize. Yolo has two
 * such surfaces already (the focus and rest zen overlays, both `fixed inset-0
 * z-50`), plus modal dialogs.
 *
 * Rendering the buttons here, pinned above every one of them, restores the
 * macOS guarantee on Windows. `TitleBar` only reserves their footprint.
 *
 * Mounted outside the shell's `inert` wrapper in `App`, so the buttons stay
 * focusable and clickable exactly when the rest of the app is deliberately
 * not — which is the moment they matter most.
 */
export function WindowFrame({
  /** Whether a full-screen overlay (focus/rest zen) is covering the app. */
  overlayActive
}: {
  overlayActive: boolean;
}) {
  if (!usesCustomWindowControls) return null;

  return (
    <>
      {/* While an overlay owns the screen it has also swallowed the title
          bar's drag region, so the window can no longer be moved. Restore a
          drag strip for exactly that case — mounting it unconditionally would
          sit on top of the title bar's own controls. */}
      {overlayActive && (
        <div
          data-tauri-drag-region
          className="fixed inset-x-0 top-0 z-[90] h-[var(--titlebar-height)]"
          aria-hidden="true"
        />
      )}

      <div className="fixed right-0 top-0 z-[100] flex h-[var(--titlebar-height)]">
        <WindowControls />
      </div>
    </>
  );
}
