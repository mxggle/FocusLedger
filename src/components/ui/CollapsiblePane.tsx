import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import { settle } from "../../utils/motion";
import { Tooltip } from "./Tooltip";

type CollapsiblePaneProps = {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  /** Icon shown in the header chip and centered in the collapsed rail */
  icon?: LucideIcon;
  /** Short live figure rendered next to the title, e.g. "3 open" */
  meta?: string;
  /** Content shown in the rail when collapsed (overrides icon if provided) */
  railContent?: ReactNode;
};

/**
 * A floating workspace card: rounded, glassy, with a slim header bar that
 * names the pane and holds its collapse control. Panes sit on the aurora
 * canvas with gaps between them instead of sharing hairline borders, so the
 * page reads as a set of surfaces rather than a partitioned admin grid.
 */
export function CollapsiblePane({
  title,
  collapsed,
  onToggle,
  children,
  className,
  icon: PaneIcon,
  meta,
  railContent
}: CollapsiblePaneProps) {
  const reduce = useReducedMotion();

  // Distinguish a user toggle from the pane's first mount: content should
  // settle in from the rail's direction only when the user expands the pane.
  // On page load / route change the pane holds still — the route-level fade
  // (App.tsx) is the single entrance layer, and stacking a second one here is
  // what makes navigation feel noisy.
  const hasMounted = useRef(false);
  useEffect(() => {
    hasMounted.current = true;
  }, []);
  const animateExpand = hasMounted.current && !reduce;

  const cardChrome =
    "overflow-hidden rounded-xl border border-border/70 bg-surface/80 shadow-card backdrop-blur-sm";

  if (collapsed) {
    return (
      // The entire rail is a single clickable affordance — a slim card with
      // the pane's icon up top and its name running down the spine.
      <div className={cn("flex w-11 shrink-0 flex-col", cardChrome, className)}>
        <Tooltip content={`Expand ${title}`} side="right">
          <button
            type="button"
            aria-label={`Expand ${title} pane`}
            aria-expanded={false}
            onClick={onToggle}
            className={cn(
              "group flex h-full w-full flex-col items-center gap-3 pb-3 pt-2.5",
              "cursor-pointer select-none outline-none",
              "text-muted-foreground",
              "hover:bg-muted/60 hover:text-foreground",
              "focus-visible:bg-muted focus-visible:text-foreground",
              "transition-colors duration-fast"
            )}
          >
            {railContent ? (
              railContent
            ) : (
              <>
                {PaneIcon ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/70 ring-1 ring-inset ring-border/60">
                    <PaneIcon className="h-3.5 w-3.5" />
                  </span>
                ) : null}
                <span className="text-[11px] font-semibold uppercase tracking-widest [writing-mode:vertical-rl]">
                  {title}
                </span>
                <span className="flex flex-1 items-end">
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      "opacity-0 transition-opacity duration-fast",
                      "group-hover:opacity-60 group-focus-visible:opacity-60"
                    )}
                  />
                </span>
              </>
            )}
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 flex-col",
        cardChrome,
        className
      )}
    >
      {/* Header bar — names the pane, carries a live figure, and keeps the
          collapse control discoverable instead of hover-revealed. */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-surface-2/50 px-3">
        {PaneIcon ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-soft/80 text-primary-soft-foreground ring-1 ring-inset ring-primary/10">
            <PaneIcon className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
          {title}
        </span>
        {meta ? (
          <span className="truncate text-xs tabular-nums text-muted-foreground">
            {meta}
          </span>
        ) : null}
        <Tooltip content={`Collapse ${title}`} side="left">
          <button
            type="button"
            aria-label={`Collapse ${title} pane`}
            aria-expanded={true}
            onClick={onToggle}
            className={cn(
              "ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md outline-none",
              "text-muted-foreground/70",
              "hover:bg-muted hover:text-foreground active:scale-90",
              "focus-visible:shadow-ring",
              "transition-[background-color,color,transform] duration-fast"
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>

      {/* Scrollable content — a query container so inner UI (task cards, the
          summary scorecard) can adapt to the pane's width rather than the
          viewport's. Panes split the window, so pane width ≠ viewport width. */}
      <motion.div
        className="@container min-h-0 flex-1 overflow-y-auto"
        initial={animateExpand ? { opacity: 0, x: -8 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={settle}
      >
        {children}
      </motion.div>
    </div>
  );
}
