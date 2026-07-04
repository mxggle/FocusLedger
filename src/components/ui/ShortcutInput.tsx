import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);

const KEY_DISPLAY: Record<string, string> = {
  CmdOrCtrl: "⌘ Ctrl",
  Meta: "⌘",
  Control: "Ctrl",
  Alt: "⌥",
  Shift: "⇧",
  " ": "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  Delete: "Del",
  Backspace: "⌫"
};

function formatShortcut(shortcut: string): string[] {
  if (!shortcut) return [];
  return shortcut.split("+").map((part) => {
    const trimmed = part.trim();
    return KEY_DISPLAY[trimmed] ?? trimmed;
  });
}

const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;

function eventToShortcut(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;

  // A bare key (or Shift-only combo) would hijack normal typing — both the
  // in-app listener and the OS-wide registration would swallow it. Require a
  // real modifier; function keys are the conventional exception.
  const hasRealModifier = event.ctrlKey || event.metaKey || event.altKey;
  if (!hasRealModifier && !FUNCTION_KEY.test(event.key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CmdOrCtrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key);

  return parts.join("+");
}

export function ShortcutInput({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!recording) return;

    function onKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecording(false);
        return;
      }

      // Bare Backspace/Delete clears the shortcut (with modifiers they can
      // still be recorded as a combo, e.g. Cmd+Backspace).
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        onChange("");
        setRecording(false);
        return;
      }

      const shortcut = eventToShortcut(event);
      if (shortcut) {
        onChange(shortcut);
        setRecording(false);
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setRecording(false);
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [recording, onChange]);

  const parts = formatShortcut(value);

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={recording ? "Press shortcut keys" : `Shortcut: ${value || "none"}`}
      onClick={() => setRecording(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setRecording(true);
      }}
      className={cn(
        "flex h-9 w-full cursor-pointer select-none items-center gap-1.5 rounded-md border px-3",
        "bg-surface text-sm shadow-xs outline-none",
        "transition-[box-shadow,border-color] duration-fast",
        recording
          ? "border-ring shadow-ring"
          : "border-input hover:border-border-strong focus:border-ring focus:shadow-ring"
      )}
    >
      {recording ? (
        <span className="animate-pulse text-xs text-muted-foreground">
          Press a key with ⌘/Ctrl/Alt… (⌫ clears, Esc cancels)
        </span>
      ) : parts.length > 0 ? (
        parts.map((part, i) => (
          <kbd
            key={i}
            className="inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] text-foreground"
          >
            {part}
          </kbd>
        ))
      ) : (
        <span className="text-subtle">Click to record</span>
      )}
    </div>
  );
}
