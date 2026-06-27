import { SendHorizonal, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { hasAiKey } from "../../services/ai/aiClient";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { IconButton } from "../ui/IconButton";
import { AnimatePresence } from "framer-motion";
import { useAssistantStore } from "../../stores/assistantStore";
import { SlashCommandMenu, type SlashCommand } from "./SlashCommandMenu";
import { AutonomyMenu } from "./AutonomyMenu";

const MAX_HEIGHT = 220;

export function buildPlanPrompt(text: string): string {
  return `Organize the following into well-scoped tasks. Check for duplicates first and estimate from my history:\n\n${text}`;
}

const SLASH_PROMPTS: Record<string, (args: string) => string> = {
  plan: (args) => buildPlanPrompt(args),
  today: () => "How is today looking?",
  reschedule: () => "Reschedule what I didn't finish to tomorrow.",
  backlog: () => "Review my backlog and propose what to schedule this week."
};

type SlashState = { start: number; query: string } | null;

function activeSlashToken(value: string, caret: number): SlashState {
  const before = value.slice(0, caret);
  const lastSpace = before.lastIndexOf(" ");
  const tokenStart = lastSpace + 1;
  const token = before.slice(tokenStart);
  if (token.startsWith("/")) {
    return { start: tokenStart, query: token.slice(1) };
  }
  return null;
}

export function Composer() {
  const [value, setValue] = useState("");
  const [slash, setSlash] = useState<SlashState>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const send = useAssistantStore((s) => s.send);
  const stop = useAssistantStore((s) => s.stop);
  const clear = useAssistantStore((s) => s.clear);
  const status = useAssistantStore((s) => s.status);
  const settings = useSettingsStore((s) => s.settings);
  const addToast = useUiStore((s) => s.addToast);
  const keyConfigured = hasAiKey(settings);

  const busy = status === "thinking" || status === "streaming";

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (text.length === 0 || busy || !keyConfigured) return;

    // `display` is what the user sees in the chat; `outgoing` is what the model receives.
    // `/plan` wrapping is internal scaffolding, so it must not leak into the bubble.
    let display = text;
    let outgoing = text;
    if (text.startsWith("/")) {
      const [name, ...rest] = text.slice(1).split(/\s+/);
      const args = rest.join(" ").trim();
      const builder = SLASH_PROMPTS[name ?? ""];
      if (name === "clear") {
        clear();
        addToast({ kind: "info", title: "Conversation cleared" });
        setValue("");
        setSlash(null);
        return;
      }
      if (builder) {
        if (name === "plan") {
          display = args || text;
          outgoing = buildPlanPrompt(args);
        } else {
          display = builder(args);
          outgoing = display;
        }
      }
    }

    setValue("");
    setSlash(null);
    void send(display, outgoing === display ? undefined : outgoing);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (slash !== null) return; // let the slash menu handle Enter (insert highlighted)
      submit();
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value;
    const caret = event.target.selectionStart ?? next.length;
    const token = activeSlashToken(next, caret);
    setSlash(token);
    if (token) {
      setAnchorRect(event.target.getBoundingClientRect());
    }
    setValue(next);
  }

  function handleSlashSelect(command: SlashCommand) {
    if (command.immediate) {
      clear();
      addToast({ kind: "info", title: "Conversation cleared" });
      setValue("");
      setSlash(null);
      return;
    }
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const token = activeSlashToken(value, caret);
    const start = token?.start ?? caret;
    const inserted = `/${command.name} `;
    const next = value.slice(0, start) + inserted + value.slice(caret);
    setValue(next);
    setSlash(null);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      const pos = start + inserted.length;
      node.focus();
      node.setSelectionRange(pos, pos);
    });
  }

  const placeholder = busy
    ? "Thinking…"
    : keyConfigured
      ? "Describe what you want to plan…"
      : "Add an API key in Settings → AI";

  return (
    <form onSubmit={handleSubmit} className="border-t border-border p-3">
      <div className="relative flex items-end gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 focus-within:border-primary">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder}
          disabled={!keyConfigured}
          className="max-h-[220px] min-h-[2.25rem] flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:shadow-none disabled:opacity-60"
        />
        {busy ? (
          <IconButton
            icon={Square}
            label="Stop"
            variant="ghost"
            size="sm"
            onClick={() => stop()}
            className="bg-destructive-soft text-destructive hover:brightness-[1.02]"
          />
        ) : (
          <IconButton
            type="submit"
            icon={SendHorizonal}
            label="Send"
            variant="secondary"
            size="sm"
            disabled={!keyConfigured || value.trim().length === 0}
          />
        )}

        <AnimatePresence>
          {slash ? (
            <SlashCommandMenu
              query={slash.query}
              anchorRect={anchorRect}
              onSelect={handleSlashSelect}
              onClose={() => setSlash(null)}
            />
          ) : null}
        </AnimatePresence>
      </div>

      {keyConfigured ? (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 pl-1">
          <AutonomyMenu />
          <p className="text-[11px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1 font-sans">↵</kbd> to send ·{" "}
            <kbd className="rounded border border-border bg-muted px-1 font-sans">Shift+↵</kbd> for a new line
            {value.length > 0 ? ` · ${value.length}` : ""}
          </p>
        </div>
      ) : null}
    </form>
  );
}
