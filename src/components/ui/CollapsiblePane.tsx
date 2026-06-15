import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type CollapsiblePaneProps = {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  /** Content shown in the rail (icon or short text) when collapsed */
  railContent?: ReactNode;
};

export function CollapsiblePane({
  title,
  collapsed,
  onToggle,
  children,
  className,
  railContent
}: CollapsiblePaneProps) {
  if (collapsed) {
    return (
      // The entire rail is a single clickable affordance.
      // border-r is passed in via className from TodayPage; we don't add one here
      // so that neighboring panes don't double-up borders.
      <div
        className={cn(
          "flex w-11 shrink-0 flex-col",
          className
        )}
      >
        <button
          type="button"
          aria-label={`Expand ${title} pane`}
          aria-expanded={false}
          onClick={onToggle}
          className={cn(
            "flex h-full w-full flex-col items-center gap-3 py-4",
            "cursor-pointer select-none outline-none",
            "text-muted-foreground",
            "hover:bg-muted/60 hover:text-foreground",
            "focus-visible:bg-muted focus-visible:text-foreground",
            "transition-colors duration-fast"
          )}
        >
          {/* Expand chevron at top */}
          <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0" />

          {/* Vertical label — centered in remaining space */}
          <div className="flex flex-1 items-center justify-center">
            {railContent ? (
              railContent
            ) : (
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                {title}
              </span>
            )}
          </div>
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col",
        className
      )}
    >
      {/* Pane header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-surface/40 px-3.5 backdrop-blur-sm">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <button
          type="button"
          aria-label={`Collapse ${title} pane`}
          aria-expanded={true}
          onClick={onToggle}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground outline-none",
            "hover:bg-muted hover:text-foreground active:scale-90",
            "focus-visible:shadow-ring",
            "transition-[background-color,color,transform] duration-fast"
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable content — a query container so inner UI (task cards, the
          summary scorecard) can adapt to the pane's width rather than the
          viewport's. Panes split the window, so pane width ≠ viewport width. */}
      <div className="@container min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
