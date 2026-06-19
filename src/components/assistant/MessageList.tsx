import { useEffect, useRef } from "react";
import { useAssistantStore } from "../../stores/assistantStore";
import { AssistantEmptyState } from "./EmptyState";
import { MessageBubble } from "./MessageBubble";

export function MessageList() {
  const messages = useAssistantStore((state) => state.messages);
  const status = useAssistantStore((state) => state.status);
  const send = useAssistantStore((state) => state.send);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  if (messages.length === 0) {
    return <AssistantEmptyState onPick={(text) => void send(text)} />;
  }

  return (
    <div className="flex-1 space-y-4 overflow-auto p-4" aria-live="polite">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {status === "thinking" ? (
        <div className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
          Thinking…
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
