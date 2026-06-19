import { SendHorizonal } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { hasAiKey } from "../../services/ai/aiClient";
import { useAssistantStore } from "../../stores/assistantStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { IconButton } from "../ui/IconButton";

const MAX_HEIGHT = 220;

export function Composer() {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const send = useAssistantStore((state) => state.send);
  const status = useAssistantStore((state) => state.status);
  const thinking = status === "thinking";
  const settings = useSettingsStore((s) => s.settings);
  const keyConfigured = hasAiKey(settings);

  // Auto-grow the textarea to fit long-form input, up to a cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const isLongDump = value.trim().length > 200;

  function submit() {
    const text = value.trim();
    if (text.length === 0 || thinking || !keyConfigured) return;
    setValue("");
    void send(text);
  }

  function planThis() {
    const text = value.trim();
    if (text.length === 0 || thinking || !keyConfigured) return;
    setValue("");
    void send(
      `Organize the following into well-scoped tasks. Check for duplicates first and estimate from my history:\n\n${text}`
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter sends; plain Enter inserts a newline for long-form input.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  }

  const placeholder = thinking
    ? "Thinking…"
    : keyConfigured
      ? "Describe what you want to plan — be as detailed as you like…"
      : "Add an API key in Settings → AI";

  return (
    <form onSubmit={handleSubmit} className="border-t border-border p-3">
      <div className="flex items-end gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 focus-within:border-primary">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={placeholder}
          disabled={thinking || !keyConfigured}
          className="min-h-[3rem] flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <IconButton
          type="submit"
          icon={SendHorizonal}
          label="Send"
          variant="secondary"
          disabled={thinking || !keyConfigured || value.trim().length === 0}
        />
      </div>
      {keyConfigured ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 pl-1">
          <p className="text-[11px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1 font-sans">⌘↵</kbd> to send ·{" "}
            <kbd className="rounded border border-border bg-muted px-1 font-sans">↵</kbd> for a new line
          </p>
          {isLongDump && !thinking ? (
            <button
              type="button"
              onClick={planThis}
              className="shrink-0 rounded-md border border-primary/40 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
            >
              ✨ Plan this
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
