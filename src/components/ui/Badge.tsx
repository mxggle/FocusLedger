import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}
