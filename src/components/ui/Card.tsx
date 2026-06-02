import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type CardProps = {
  children: ReactNode;
  className?: string;
  /** Optional header content rendered above children */
  header?: ReactNode;
  /** Remove inner padding (for custom layouts) */
  flush?: boolean;
  /** Lift on hover (use for interactive cards) */
  interactive?: boolean;
};

export function Card({
  children,
  className,
  header,
  flush,
  interactive
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-card",
        interactive &&
          "transition-[box-shadow,border-color,transform] duration-fast hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md",
        className
      )}
    >
      {header ? (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          {header}
        </div>
      ) : null}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </div>
  );
}

type CardHeaderProps = {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function CardHeader({ title, action, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <div className="text-sm font-semibold tracking-tight text-foreground">
        {title}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
