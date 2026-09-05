import type { ReactNode } from "react";
import { hasNativeTrafficLights, isMac, usesCustomWindowControls } from "../../utils/platform";
import { WINDOW_CONTROLS_WIDTH } from "./WindowControls";

/**
 * The app's own title bar, spanning the full window width above the sidebar
 * and content.
 *
 * Both platforms get the same bar; only the window buttons differ, and they
 * differ in the way each OS expects:
 *
 *   macOS   native traffic lights, top-left, repositioned into this bar by
 *           `position_traffic_lights` in `src-tauri/src/lib.rs`. We reserve
 *           their space with a leading spacer and never draw them ourselves.
 *   Windows the window is undecorated, so the app draws minimize / maximize /
 *           close itself. They are rendered by `WindowFrame` in a layer above
 *           everything — including full-screen overlays — so they can never be
 *           covered up; this bar only reserves their space.
 *
 * The whole bar is a drag region. That is implemented as one absolutely
 * positioned layer *behind* the content rather than an attribute on the header
 * itself, so a drag can never land on a button and turn a click into a window
 * move — the same trick the previous shell used, kept because it works.
 */

/**
 * Space reserved at the leading edge for the macOS traffic lights, in px.
 *
 * The lights are 14pt wide on 20pt centres starting at `TRAFFIC_LIGHT_INSET_X`
 * (20) — see `src-tauri/src/lib.rs` — so they end at 20 + 40 + 14 = 74. The
 * extra 10 keeps the first control from crowding the zoom button. Change this
 * and `TRAFFIC_LIGHT_INSET_X` together.
 */
export const TITLE_BAR_LEADING_INSET = 84;

type TitleBarProps = {
  /** App or window title. Centred on macOS, leading-aligned on Windows. */
  title: string;
  /** Controls pinned to the leading edge, after the traffic-light spacer. */
  leading?: ReactNode;
  /** Controls pinned to the trailing edge, before the caption buttons. */
  trailing?: ReactNode;
};

export function TitleBar({ title, leading, trailing }: TitleBarProps) {
  return (
    <header
      // No border or background: the bar is part of the window material, and
      // the caption buttons need the full height as their hit target.
      className="relative z-20 flex h-[var(--titlebar-height)] shrink-0 items-stretch"
    >
      {/* Drag layer. Sits behind everything interactive; Tauri also gives us
          double-click-to-zoom on it for free, on both platforms. */}
      <div
        data-tauri-drag-region
        className="absolute inset-0"
        aria-hidden="true"
      />

      {hasNativeTrafficLights && (
        <div
          style={{ width: TITLE_BAR_LEADING_INSET }}
          className="shrink-0"
          aria-hidden="true"
        />
      )}

      <div className="relative z-10 flex items-center gap-1 pl-2">{leading}</div>

      {/* Title. On macOS it is optically centred in the window the way AppKit
          centres a document title; on Windows it sits beside the app's leading
          controls, where the Fluent title block lives. `pointer-events-none`
          lets a drag started on the title reach the drag layer beneath it. */}
      {isMac ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full items-center justify-center">
          <span className="text-[13px] font-semibold tracking-tight text-foreground/80">
            {title}
          </span>
        </div>
      ) : (
        <div className="pointer-events-none relative z-10 flex items-center pl-2">
          <span className="text-[12px] font-semibold tracking-tight text-foreground/80">
            {title}
          </span>
        </div>
      )}

      <div className="flex-1" />

      <div className="relative z-10 flex items-center gap-1 pr-2">{trailing}</div>

      {/* Reserve the caption buttons' space; `WindowFrame` draws them in a
          layer above the whole app, the way macOS floats its traffic lights
          above the webview. */}
      {usesCustomWindowControls && (
        <div
          style={{ width: WINDOW_CONTROLS_WIDTH }}
          className="shrink-0"
          aria-hidden="true"
        />
      )}
    </header>
  );
}
