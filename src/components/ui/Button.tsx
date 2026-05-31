import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "secondary" && "border-border bg-background hover:bg-muted",
        variant === "ghost" && "border-transparent bg-transparent hover:bg-muted",
        variant === "danger" && "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
        size === "sm" && "h-8 px-2.5",
        size === "md" && "h-9 px-3",
        size === "icon" && "h-8 w-8",
        className
      )}
      {...props}
    />
  );
}
