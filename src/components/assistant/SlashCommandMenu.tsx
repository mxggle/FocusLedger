import { motion } from "framer-motion";
import { CalendarClock, CalendarRange, Eraser, ListChecks, Sparkles } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

export type SlashMode = "plan" | "quick";

export type SlashCommand = {
  name: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Executes immediately on pick instead of inserting (e.g. /clear). */
  immediate?: boolean;
  /** Sets the composer mode chip when picked. */
  mode?: SlashMode;
};

export const COMMANDS: SlashCommand[] = [
  { name: "plan", label: "Plan", description: "Turn text into scoped tasks", icon: Sparkles, mode: "plan" },
  { name: "today", label: "Today", description: "How is today looking?", icon: CalendarRange },
  { name: "reschedule", label: "Reschedule", description: "Move unfinished to tomorrow", icon: CalendarClock },
  { name: "backlog", label: "Backlog", description: "Review backlog for this week", icon: ListChecks },
  { name: "clear", label: "Clear", description: "Clear the conversation", icon: Eraser, immediate: true }
];

type SlashCommandMenuProps = {
  query: string;
  anchorRect: DOMRect | null;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
};

export function SlashCommandMenu({ query, anchorRect, onSelect, onClose }: SlashCommandMenuProps) {
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return COMMANDS;
    return COMMANDS.filter(
      (cmd) => cmd.name.toLowerCase().includes(needle) || cmd.label.toLowerCase().includes(needle)
    );
  }, [query]);

  const [highlighted, setHighlighted] = useState(0);
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (matches.length === 0) {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        return;
      }
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setHighlighted((i) => (i + 1) % matches.length);
          break;
        case "ArrowUp":
          event.preventDefault();
          setHighlighted((i) => (i - 1 + matches.length) % matches.length);
          break;
        case "Enter":
        case "Tab":
          event.preventDefault();
          onSelect(matches[highlighted]);
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
      }
    }
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [matches, highlighted, onSelect, onClose]);

  const style: React.CSSProperties = anchorRect
    ? { left: anchorRect.left, bottom: window.innerHeight - anchorRect.top + 8 }
    : { left: 0, top: 0 };

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.14 }}
      style={style}
      className="absolute z-50 w-64 rounded-lg border border-border bg-elevated p-1 shadow-pop"
      role="listbox"
    >
      {matches.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">No matching commands</p>
      ) : (
        matches.map((cmd, index) => {
          const Icon = cmd.icon;
          return (
            <button
              key={cmd.name}
              type="button"
              data-cmd={cmd.name}
              aria-selected={index === highlighted}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => onSelect(cmd)}
              className={
                "flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors " +
                (index === highlighted ? "bg-muted" : "hover:bg-muted")
              }
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-medium text-foreground">/{cmd.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">{cmd.description}</span>
              </span>
            </button>
          );
        })
      )}
    </motion.div>
  );
}
