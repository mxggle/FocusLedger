import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { usesCustomWindowControls } from "../../utils/platform";

/**
 * Windows caption buttons: minimize, maximize/restore, close.
 *
 * macOS keeps its own traffic lights (repositioned into our title bar natively
 * by `position_traffic_lights` in `src-tauri/src/lib.rs`), so this renders
 * nothing there. On Windows the window is undecorated — see
 * `src-tauri/tauri.windows.conf.json` — so the app owes the user these three
 * buttons, drawn to the Fluent spec so they read as the OS and not as app UI:
 *
 *   - 46pt-wide hit targets, full bar height, flush to the corner, no gaps
 *   - a neutral wash on hover, except close, which goes Fluent red (#C42B1C)
 *   - hairline 10×10 glyphs at 1px stroke, matching Segoe Fluent Icons
 *
 * The glyphs are drawn as SVG rather than set in Segoe Fluent Icons: that
 * font is absent on Windows 10 and in every non-Windows browser, and a
 * missing-glyph tofu in the title bar is far worse than a drawn square.
 *
 * Close routes through the window's close *request*, so it hides to the tray
 * exactly like the macOS red button — see the `CloseRequested` handler in
 * `src-tauri/src/lib.rs`.
 */

/** Width of one caption button, and of all three together, in px. */
const CAPTION_BUTTON_WIDTH = 46;
export const WINDOW_CONTROLS_WIDTH = CAPTION_BUTTON_WIDTH * 3;

type WindowLike = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onResized: (handler: () => void) => Promise<() => void>;
};

async function currentWindow(): Promise<WindowLike | null> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow() as unknown as WindowLike;
  } catch {
    return null;
  }
}

export function WindowControls() {
  // The middle button is a toggle, so it must show "restore" whenever the
  // window is maximized — including when the user got there by dragging to the
  // top edge or pressing Win+Up rather than by clicking us.
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!usesCustomWindowControls) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const win = await currentWindow();
      if (!win || disposed) return;
      const sync = () => {
        void win
          .isMaximized()
          .then((value) => {
            if (!disposed) setMaximized(value);
          })
          .catch(() => {
            // Preview outside Tauri: leave the button showing "maximize".
          });
      };
      sync();
      unlisten = await win.onResized(sync);
      // The await above yields, so the effect may have been torn down while we
      // were subscribing; drop the listener we just created if so.
      if (disposed) unlisten?.();
    })().catch(() => {
      // No window to subscribe to (browser preview). Nothing to keep in sync.
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const run = useCallback((action: (win: WindowLike) => Promise<void>) => {
    void (async () => {
      const win = await currentWindow();
      if (!win) return;
      try {
        await action(win);
      } catch (error) {
        // A window command can legitimately fail — most often outside Tauri,
        // where these buttons are only being previewed. Never let it surface
        // as an unhandled rejection.
        console.warn("yolo: window command failed", error);
      }
    })();
  }, []);

  if (!usesCustomWindowControls) return null;

  return (
    <div className="flex shrink-0 self-stretch">
      <CaptionButton label="Minimize" onClick={() => run((win) => win.minimize())}>
        <path d="M0.5 5.5H9.5" />
      </CaptionButton>

      <CaptionButton
        label={maximized ? "Restore" : "Maximize"}
        onClick={() => run((win) => win.toggleMaximize())}
      >
        {maximized ? (
          // Restore: the front pane, plus the visible corner of the one behind
          // it. Drawn as strokes so nothing needs an opaque fill — the title
          // bar is translucent over the window material.
          <>
            <path d="M2.5 2.5V0.5H9.5V7.5H7.5" />
            <rect x="0.5" y="2.5" width="7" height="7" />
          </>
        ) : (
          <rect x="0.5" y="0.5" width="9" height="9" />
        )}
      </CaptionButton>

      <CaptionButton label="Close" danger onClick={() => run((win) => win.close())}>
        <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" />
      </CaptionButton>
    </div>
  );
}

type CaptionButtonProps = {
  label: string;
  danger?: boolean;
  onClick: () => void;
  /** Glyph geometry, drawn into a 10×10 stroked SVG viewBox. */
  children: ReactNode;
};

function CaptionButton({ label, danger, onClick, children }: CaptionButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ width: CAPTION_BUTTON_WIDTH }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center self-stretch",
        "text-foreground/75 outline-none transition-colors duration-fast",
        // Deliberately no rounded corners and no focus halo: caption buttons
        // are part of the window frame, not app controls, and the app's soft
        // accent ring would look pasted on.
        "focus-visible:shadow-none",
        danger
          ? "hover:bg-[#c42b1c] hover:text-white focus-visible:bg-[#c42b1c] focus-visible:text-white active:bg-[#c42b1c]/90"
          : "hover:bg-foreground/[0.08] focus-visible:bg-foreground/[0.08] active:bg-foreground/[0.05]"
      )}
    >
      {/* 10×10 at 1px stroke is the Segoe Fluent Icons metric, so these sit at
          the same weight and size as the caption glyphs in every other app. */}
      <svg
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        shapeRendering="crispEdges"
      >
        {children}
      </svg>
    </button>
  );
}
