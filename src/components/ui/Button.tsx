import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

const buttonVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium",
    "transition-[transform,background-color,box-shadow,border-color,color] duration-fast",
    "outline-none focus-visible:shadow-ring focus-visible:border-ring",
    "active:scale-[0.97]",
    // A genuinely muted disabled state (not a faded primary).
    // bg-none also strips the primary variant's gradient image when disabled.
    "disabled:pointer-events-none disabled:scale-100 disabled:border-transparent disabled:bg-muted disabled:bg-none disabled:text-muted-foreground/70 disabled:shadow-none"
  ],
  {
    variants: {
      variant: {
        // bg-primary is the fallback under the signature gradient.
        primary:
          "border-primary/0 bg-primary bg-gradient-accent text-primary-foreground shadow-sm hover:bg-gradient-accent-hover hover:shadow-glow",
        secondary:
          "border-border bg-surface text-foreground shadow-xs hover:border-border-strong hover:bg-surface-2",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        danger:
          "border-transparent bg-destructive text-destructive-foreground shadow-sm hover:brightness-110 hover:shadow-md",
        soft:
          "border-transparent bg-primary-soft text-primary-soft-foreground hover:brightness-[0.97]"
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-3.5 text-sm",
        lg: "h-11 px-5 text-base",
        icon: "h-9 w-9 shrink-0"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
});

export { buttonVariants };
