import { cn } from "../../utils/cn";

type ProgressProps = {
  value: number;
  overrun?: boolean;
  label?: string;
  className?: string;
  size?: "sm" | "md";
};

export function Progress({
  value,
  overrun,
  label,
  className,
  size = "md"
}: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? (
        <div className="flex justify-between text-xs font-medium text-muted-foreground">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div
        className={cn(
          "overflow-hidden rounded-full bg-muted shadow-[inset_0_1px_2px_rgba(17,24,39,0.08)]",
          size === "sm" ? "h-1.5" : "h-2.5"
        )}
      >
        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            overrun
              ? "bg-gradient-to-r from-warning to-warning/80"
              : "yolo-brand-gradient bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
