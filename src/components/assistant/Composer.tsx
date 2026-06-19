import { SendHorizonal } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useAssistantStore } from "../../stores/assistantStore";
import { IconButton } from "../ui/IconButton";

export function Composer() {
  const [value, setValue] = useState("");
  const send = useAssistantStore((state) => state.send);
  const status = useAssistantStore((state) => state.status);
  const thinking = status === "thinking";

  function submit() {
    const text = value.trim();
    if (text.length === 0 || thinking) return;
    setValue("");
    void send(text);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border p-3">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={thinking ? "Thinking…" : "Ask the assistant…"}
        disabled={thinking}
        className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-60"
      />
      <IconButton
        type="submit"
        icon={SendHorizonal}
        label="Send"
        variant="secondary"
        disabled={thinking || value.trim().length === 0}
      />
    </form>
  );
}
