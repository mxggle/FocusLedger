import { Check } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../ui/Button";

const MAX_HEIGHT = 220;

type MessageEditorProps = {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  busy?: boolean;
};

export function MessageEditor({ initialText, onSave, onCancel, busy }: MessageEditorProps) {
  const [value, setValue] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  function commit() {
    const text = value.trim();
    if (text.length === 0) return;
    onSave(text);
  }

  return (
    <div className="flex max-w-[85%] flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        disabled={busy}
        className="min-h-[3rem] w-full resize-none rounded-lg border border-border bg-surface px-3.5 py-2 text-sm leading-relaxed text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:shadow-ring disabled:opacity-60"
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={commit} disabled={busy || value.trim().length === 0}>
          <Check className="h-3.5 w-3.5" /> Save
        </Button>
      </div>
    </div>
  );
}
