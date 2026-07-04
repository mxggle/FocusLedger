import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type MenuProps = {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
};

export function Menu({
  trigger,
  children,
  align = "start",
  side = "bottom",
  className
}: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 min-w-[200px] rounded-xl border border-border bg-surface p-1.5 shadow-pop dark:ring-1 dark:ring-inset dark:ring-white/[0.05]",
            "data-[state=open]:animate-scale-in",
            "data-[side=top]:origin-bottom data-[side=bottom]:origin-top",
            className
          )}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type MenuItemProps = {
  icon?: LucideIcon;
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function MenuItem({
  icon: Icon,
  children,
  onSelect,
  danger,
  disabled
}: MenuItemProps) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={() => onSelect?.()}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none",
        "transition-colors duration-fast",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        danger
          ? "text-destructive data-[highlighted]:bg-destructive-soft"
          : "text-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className="flex-1">{children}</span>
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />;
}
