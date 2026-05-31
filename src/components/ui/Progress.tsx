import { cn } from "../../utils/cn";

export function Progress({ value, overrun }: { value: number; overrun?: boolean }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", overrun ? "bg-orange-500" : "bg-primary")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
