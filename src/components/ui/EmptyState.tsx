import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  dashed?: boolean;
};

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
  dashed = false
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl px-6 py-12 text-center",
        dashed ? "border border-dashed border-border-strong" : "bg-muted/30",
        className
      )}
    >
      {Icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-surface to-muted/60 text-muted-foreground shadow-sm ring-1 ring-inset ring-border">
          <Icon className="h-6 w-6" strokeWidth={1.75} />
        </div>
      ) : null}
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {hint ? (
        <div className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {hint}
        </div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
