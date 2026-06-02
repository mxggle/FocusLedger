import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground ring-border",
        primary: "bg-primary-soft text-primary-soft-foreground ring-primary/15",
        success: "bg-success-soft text-success-soft-foreground ring-success/20",
        warning: "bg-warning-soft text-warning-soft-foreground ring-warning/20",
        danger:
          "bg-destructive-soft text-destructive-soft-foreground ring-destructive/20"
      }
    },
    defaultVariants: {
      variant: "neutral"
    }
  }
);

type BadgeProps = VariantProps<typeof badgeVariants> & {
  children: ReactNode;
  className?: string;
  /** Render a leading status dot in the badge's color */
  dot?: boolean;
};

const dotColor: Record<string, string> = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive"
};

export function Badge({ children, variant, className, dot }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      {dot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            dotColor[variant ?? "neutral"]
          )}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}
