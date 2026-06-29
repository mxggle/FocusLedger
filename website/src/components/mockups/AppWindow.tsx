import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** macOS-style window chrome used to frame product screenshots/mockups. */
export function AppWindow({
  children,
  title = "Yolo",
  className,
  accent
}: {
  children: ReactNode;
  title?: string;
  className?: string;
  /** Optional CSS color string to recolor the focus accent inside this frame. */
  accent?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border-strong bg-surface shadow-pop",
        className
      )}
      style={accent ? ({ ["--focus-accent" as string]: accent } as React.CSSProperties) : undefined}
    >
      <div className="flex h-9 items-center gap-2 border-b border-border bg-surface-2 px-4">
        <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="ml-3 text-xs font-medium text-subtle">{title}</span>
      </div>
      {children}
    </div>
  );
}
