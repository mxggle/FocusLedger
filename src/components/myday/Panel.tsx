import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type PanelProps = {
  title?: string;
  /** Optional right-aligned header slot (e.g. a total or action). */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** Titled surface card shared by the My Day modules. */
export function Panel({ title, aside, className, children }: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-surface p-5 shadow-card",
        className
      )}
    >
      {title || aside ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}
