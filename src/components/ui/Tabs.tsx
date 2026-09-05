import { motion, useReducedMotion } from "framer-motion";
import type { KeyboardEvent } from "react";
import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

export type TabItem<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

type TabBarProps<T extends string> = {
  /** Namespace for the tab/panel ids so panels can point back at their tab. */
  idBase: string;
  label: string;
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function tabId(idBase: string, value: string) {
  return `${idBase}-tab-${value}`;
}

export function tabPanelId(idBase: string, value: string) {
  return `${idBase}-panel-${value}`;
}

/**
 * A horizontal tab bar with the app's segmented-control look but real tab
 * semantics: roving tabindex plus arrow/Home/End keys, activating as you move.
 */
export function TabBar<T extends string>({
  idBase,
  label,
  tabs,
  value,
  onChange,
  className
}: TabBarProps<T>) {
  const reduceMotion = useReducedMotion();
  const refs = useRef(new Map<string, HTMLButtonElement>());

  function move(offset: number) {
    const index = tabs.findIndex((tab) => tab.value === value);
    if (index < 0) return;
    const next = tabs[(index + offset + tabs.length) % tabs.length];
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  }

  function jumpTo(tab: TabItem<T>) {
    onChange(tab.value);
    refs.current.get(tab.value)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      jumpTo(tabs[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      jumpTo(tabs[tabs.length - 1]);
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/70 p-1",
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              if (node) refs.current.set(tab.value, node);
              else refs.current.delete(tab.value);
            }}
            type="button"
            role="tab"
            id={tabId(idBase, tab.value)}
            aria-selected={active}
            aria-controls={tabPanelId(idBase, tab.value)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium outline-none",
              "h-8 transition-colors duration-fast focus-visible:shadow-ring",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active ? (
              <motion.span
                layoutId={`${idBase}-tab-indicator`}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 500, damping: 38 }
                }
                className="absolute inset-0 rounded-md bg-surface shadow-sm ring-1 ring-inset ring-border"
              />
            ) : null}
            {Icon ? <Icon className="relative z-10 h-3.5 w-3.5" /> : null}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
