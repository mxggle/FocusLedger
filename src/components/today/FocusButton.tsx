import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { cn } from "../../utils/cn";

/**
 * The action language for the focus stage. Unlike the app's flat brand buttons,
 * these are built to sit *on* an ambient scene: the primary is a luminous pill
 * that glows in the active scene's accent (`--focus-accent`), and the secondary
 * is frosted glass that lets the scene show through. Both adopt the scene color
 * automatically because they read the inherited `--focus-accent` variable, so a
 * fire session gets amber controls and a river session gets teal — no props.
 */
const focusButton = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap",
    "rounded-full font-semibold tracking-tight",
    "transition-[transform,background-color,border-color,box-shadow,filter,color] duration-150",
    "outline-none focus-visible:shadow-[0_0_0_3px_hsl(var(--focus-accent)/0.32)]",
    "active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-55"
  ],
  {
    variants: {
      variant: {
        // Luminous accent pill — the committed action (Resume / Done).
        accent: "border border-white/10 text-white hover:brightness-[1.05]",
        // Frosted glass — the lighter-weight action; the scene reads through it.
        glass: cn(
          "border text-foreground backdrop-blur-md",
          "bg-[hsl(var(--surface)/0.5)] border-[hsl(var(--focus-accent)/0.22)]",
          "hover:bg-[hsl(var(--surface)/0.72)] hover:border-[hsl(var(--focus-accent)/0.42)]"
        )
      },
      size: {
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-sm"
      }
    },
    defaultVariants: { variant: "accent", size: "md" }
  }
);

const ACCENT_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, hsl(var(--focus-accent) / 0.97), hsl(var(--focus-accent) / 0.82))",
  boxShadow:
    "inset 0 1px 0 0 hsl(0 0% 100% / 0.28), " +
    "0 8px 24px -8px hsl(var(--focus-accent) / 0.6), " +
    "0 2px 6px -3px hsl(var(--focus-accent) / 0.5)",
  textShadow: "0 1px 1.5px rgba(0, 0, 0, 0.22)"
};

const GLASS_STYLE: CSSProperties = {
  boxShadow:
    "inset 0 1px 0 0 hsl(0 0% 100% / 0.14), 0 4px 16px -6px hsl(var(--foreground) / 0.16)"
};

type FocusButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof focusButton>;

export const FocusButton = forwardRef<HTMLButtonElement, FocusButtonProps>(
  function FocusButton({ className, variant = "accent", size, style, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(focusButton({ variant, size }), className)}
        style={{ ...(variant === "glass" ? GLASS_STYLE : ACCENT_STYLE), ...style }}
        {...props}
      />
    );
  }
);
