import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
  delay?: number;
};

/**
 * App-wide tooltip provider. Mount once near the root so all tooltips share
 * a single hover-intent timer (Radix best practice).
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={150}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = "right",
  disabled,
  delay
}: TooltipProps) {
  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <RadixTooltip.Root delayDuration={delay}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 select-none rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-pop",
            "data-[state=delayed-open]:animate-scale-in",
            "data-[side=top]:origin-bottom data-[side=bottom]:origin-top data-[side=left]:origin-right data-[side=right]:origin-left"
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-foreground" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
