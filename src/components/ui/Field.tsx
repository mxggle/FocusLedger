import { ChevronDown } from "lucide-react";
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";
import { cn } from "../../utils/cn";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && !error ? (
        <span className="text-xs text-subtle">{hint}</span>
      ) : null}
      {error ? (
        <span className="text-xs font-medium text-destructive">{error}</span>
      ) : null}
    </label>
  );
}

const controlBase = cnControl();

function cnControl() {
  return [
    "w-full rounded-md border border-input bg-surface text-sm text-foreground shadow-xs outline-none",
    "transition-[box-shadow,border-color,background-color] duration-fast",
    "placeholder:text-subtle",
    "hover:border-border-strong",
    "focus:border-ring focus:shadow-ring focus:hover:border-ring",
    "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60"
  ];
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, type, ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        controlBase,
        "h-9 px-3",
        type === "number" && [
          "[appearance:textfield]",
          "[&::-webkit-inner-spin-button]:appearance-none",
          "[&::-webkit-outer-spin-button]:appearance-none"
        ],
        (type === "time" || type === "date") && "cursor-pointer",
        className
      )}
      {...props}
    />
  );
});

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlBase, "min-h-20 px-3 py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

/**
 * A styled native <select> that matches the design system.
 * appearance-none removes OS chrome; ChevronDown is layered on the right.
 * Keyboard/screen-reader behaviour is unchanged (real native select).
 */
export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(controlBase, "h-9 cursor-pointer appearance-none pl-3 pr-8", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
        aria-hidden="true"
      />
    </div>
  );
}
