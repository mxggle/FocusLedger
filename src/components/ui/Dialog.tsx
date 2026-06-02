import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  align?: "center" | "top";
  /** Accessible label when there is no visible <DialogTitle> */
  ariaLabel?: string;
};

const sizes: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl"
};

export function Dialog({
  open,
  onClose,
  children,
  className,
  size = "md",
  align = "center",
  ariaLabel
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[3px]",
            "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out"
          )}
        />
        <div
          className={cn(
            "fixed inset-0 z-50 flex justify-center overflow-y-auto p-4",
            align === "top" ? "items-start pt-[12vh]" : "items-center"
          )}
        >
          <RadixDialog.Content
            aria-label={ariaLabel}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative w-full rounded-2xl border border-border bg-surface shadow-pop outline-none",
              "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
              sizes[size],
              className
            )}
          >
            {children}
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function DialogTitle({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Title
      className={cn("text-base font-semibold tracking-tight text-foreground", className)}
    >
      {children}
    </RadixDialog.Title>
  );
}

export function DialogDescription({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Description
      className={cn("text-xs text-muted-foreground", className)}
    >
      {children}
    </RadixDialog.Description>
  );
}

export const DialogClose = RadixDialog.Close;
