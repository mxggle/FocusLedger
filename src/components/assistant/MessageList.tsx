import { useEffect, useRef } from "react";
import { hasAiKey } from "../../services/ai/aiClient";
import { useAssistantStore } from "../../stores/assistantStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { AssistantEmptyState } from "./EmptyState";
import { MessageBubble } from "./MessageBubble";

export function MessageList() {
  const messages = useAssistantStore((state) => state.messages);
  const status = useAssistantStore((state) => state.status);
  const error = useAssistantStore((state) => state.error);
  const send = useAssistantStore((state) => state.send);
  const settings = useSettingsStore((s) => s.settings);
  const keyConfigured = hasAiKey(settings);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  return (
    <div className="flex-1 overflow-auto p-4" aria-live="polite">
      {messages.length === 0 ? (
        keyConfigured ? (
          <AssistantEmptyState onPick={(text) => void send(text)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-foreground">Assistant needs an API key</p>
            <p className="text-xs text-muted-foreground">Add one in Settings → AI to start planning your day.</p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {status === "thinking" ? (
            <div className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
              Thinking…
            </div>
          ) : null}
          {status === "error" && error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
              <span>{error}</span>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
