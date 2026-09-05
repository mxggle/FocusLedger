import { Minus, PanelLeftClose, Square, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type MockPlatform = "mac" | "windows";

/**
 * The app's window frame, as the shell actually draws it since 0.8: a
 * full-width title bar above the nav rail and the content region, and window
 * buttons in whichever place the OS puts them.
 *
 *   mac      native traffic lights top-left, the title optically centred, and
 *            the content region inset from the window edge like a card.
 *   windows  Fluent caption buttons top-right, a leading title, and the
 *            content flush with the window edge, rounded only where it meets
 *            the nav pane.
 */
export function AppWindow({
  children,
  title = "Yolo",
  className,
  accent,
  platform = "mac",
  /** Set when the child draws its own nav rail + content region (TodayMock). */
  bare = false
}: {
  children: ReactNode;
  title?: string;
  className?: string;
  /** Optional CSS color string to recolor the focus accent inside this frame. */
  accent?: string;
  platform?: MockPlatform;
  bare?: boolean;
}) {
  const isMac = platform === "mac";
  return (
    <div
      className={cn(
        "overflow-hidden border border-border-strong bg-surface-2 shadow-pop",
        isMac ? "rounded-xl" : "rounded-lg",
        className
      )}
      style={accent ? ({ ["--focus-accent" as string]: accent } as React.CSSProperties) : undefined}
    >
      {/* Title bar — part of the window material: no fill, no bottom border. */}
      <div className="relative flex h-9 items-center px-3">
        {isMac ? (
          <>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
              <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
              <span className="h-3 w-3 rounded-full bg-[#28C840]" />
            </div>
            <PanelLeftClose size={13} className="ml-4 text-subtle" />
            <span className="pointer-events-none absolute inset-x-0 text-center text-[12px] font-semibold tracking-tight text-foreground/80">
              {title}
            </span>
          </>
        ) : (
          <>
            <PanelLeftClose size={13} className="text-subtle" />
            <span className="ml-2 text-[11px] font-semibold tracking-tight text-foreground/80">{title}</span>
            <div className="ml-auto -mr-3 flex h-9 items-stretch text-subtle">
              {[Minus, Square, X].map((Icon, i) => (
                <span key={i} className="grid w-[38px] place-items-center">
                  <Icon size={i === 1 ? 9 : 12} />
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {bare ? children : <ContentRegion platform={platform}>{children}</ContentRegion>}
    </div>
  );
}

/**
 * The opaque sheet the page sits on. On macOS it floats on the material with
 * an inset on the trailing and bottom edges; on Windows it meets the window
 * edge and rounds only the corner facing the nav rail.
 */
export function ContentRegion({
  children,
  platform = "mac",
  className
}: {
  children: ReactNode;
  platform?: MockPlatform;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden border-border bg-surface",
        platform === "mac"
          ? "mb-2 mr-2 rounded-xl border shadow-card"
          : "rounded-tl-md border-l border-t",
        className
      )}
    >
      {children}
    </div>
  );
}
