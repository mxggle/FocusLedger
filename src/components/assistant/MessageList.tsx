import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { hasAiKey } from "../../services/ai/aiClient";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { useAssistantStore } from "../../stores/assistantStore";
import { AssistantEmptyState } from "./EmptyState";
import { MessageRow } from "./MessageRow";
import { ReasoningPanel } from "./ReasoningPanel";
import { ScrollToBottomButton } from "./ScrollToBottomButton";

const SCROLL_THRESHOLD = 120;

export function MessageList() {
  const messages = useAssistantStore((s) => s.messages);
  const status = useAssistantStore((s) => s.status);
  const steps = useAssistantStore((s) => s.steps);
  const error = useAssistantStore((s) => s.error);
  const streamingMessageId = useAssistantStore((s) => s.streamingMessageId);
  const send = useAssistantStore((s) => s.send);
  const settings = useSettingsStore((s) => s.settings);
  const requestRoute = useUiStore((s) => s.requestRoute);
  const keyConfigured = hasAiKey(settings);
  const assistantName = settings.assistantName.trim() || "Assistant";

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(messages.length);
  const [showScrollButton, setShowScrollButton] = useState(false);

  function nearBottom(): boolean {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
  }

  function handleScroll() {
    setShowScrollButton(!nearBottom());
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // When a new message is appended (the user sends, or the assistant turn begins) always
  // pin to the bottom — the user initiated it. For in-place streaming token updates, only
  // follow along if the user is already near the bottom, so reading earlier text isn't yanked.
  useEffect(() => {
    const appended = messages.length > prevCount.current;
    prevCount.current = messages.length;
    if (appended || nearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: appended ? "auto" : "smooth" });
    }
  }, [messages, status, streamingMessageId]);

  function openSettings() {
    // The dock is non-modal now, so it can stay open while settings render in
    // the reflowed main area — the user sees their key land without losing chat.
    requestRoute("settings");
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto p-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          keyConfigured ? (
            <AssistantEmptyState name={assistantName} onPick={(text) => void send(text)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-medium text-foreground">Connect an API key to begin</p>
              <p className="text-xs text-muted-foreground">
                {assistantName} runs on your own provider key. Add one to start planning your day.
              </p>
              <Button size="sm" variant="secondary" onClick={openSettings}>
                <Settings className="h-3.5 w-3.5" /> Open AI settings
              </Button>
            </div>
          )
        ) : (
          <div className="space-y-6">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                isStreaming={message.id === streamingMessageId}
              />
            ))}
            {status === "thinking" ? (
              <div className="space-y-3">
                <ReasoningPanel steps={steps} active={true} />
                <div className="space-y-1.5 pl-7">
                  <Skeleton className="h-3 w-3/4 rounded-full" />
                  <Skeleton className="h-3 w-1/2 rounded-full" />
                  <Skeleton className="h-3 w-1/3 rounded-full" />
                </div>
              </div>
            ) : null}
            {status === "streaming" && steps.length > 0 ? (
              <ReasoningPanel steps={steps} active={false} />
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
      <ScrollToBottomButton visible={showScrollButton} onClick={scrollToBottom} />
    </div>
  );
}
