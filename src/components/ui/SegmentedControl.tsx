import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { motion } from "framer-motion";
import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

type Segment<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

type SegmentedControlProps<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
};

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
  size = "md"
}: SegmentedControlProps<T>) {
  const layoutId = useId();

  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        // Radix emits "" when re-clicking the active item; ignore deselection.
        if (next) onChange(next as T);
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-muted/70 p-1",
        className
      )}
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        const Icon = segment.icon;
        return (
          <ToggleGroup.Item
            key={segment.value}
            value={segment.value}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 rounded-md font-medium outline-none",
              "transition-colors duration-fast focus-visible:shadow-ring",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-xs",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
                className="absolute inset-0 rounded-md bg-surface shadow-sm ring-1 ring-inset ring-border"
              />
            ) : null}
            {Icon ? <Icon className="relative z-10 h-3.5 w-3.5" /> : null}
            <span className="relative z-10">{segment.label}</span>
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}
