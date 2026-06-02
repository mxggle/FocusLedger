import type { LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { icon: Icon, label, size = "md", variant = "ghost", className, ...props },
    ref
  ) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md outline-none",
        "transition-[background-color,color,box-shadow,transform,border-color] duration-fast",
        "active:scale-90 focus-visible:shadow-ring",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "h-7 w-7",
        size === "md" && "h-8 w-8",
        variant === "ghost" &&
          "text-muted-foreground hover:bg-muted hover:text-foreground",
        variant === "secondary" &&
          "border border-border bg-surface text-foreground shadow-xs hover:border-border-strong hover:bg-surface-2",
        className
      )}
      {...props}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </button>
  );
  }
);
