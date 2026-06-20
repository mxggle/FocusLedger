import { Settings } from "lucide-react";
import { useEffect, useRef } from "react";
import { hasAiKey } from "../../services/ai/aiClient";
import { useAssistantStore } from "../../stores/assistantStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { Button } from "../ui/Button";
import { AssistantEmptyState } from "./EmptyState";
import { MessageBubble } from "./MessageBubble";

export function MessageList() {
  const messages = useAssistantStore((state) => state.messages);
  const status = useAssistantStore((state) => state.status);
  const steps = useAssistantStore((state) => state.steps);
  const error = useAssistantStore((state) => state.error);
  const send = useAssistantStore((state) => state.send);
  const settings = useSettingsStore((s) => s.settings);
  const requestRoute = useUiStore((s) => s.requestRoute);
  const closeAssistant = useUiStore((s) => s.closeAssistant);
  const keyConfigured = hasAiKey(settings);
  const assistantName = settings.assistantName.trim() || "Assistant";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function openSettings() {
    closeAssistant();
    requestRoute("settings");
  }

  return (
    <div className="flex-1 overflow-y-auto p-4" aria-live="polite">
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
        <div className="space-y-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {status === "thinking" ? (
            <div className="flex flex-col gap-1 pl-1 text-xs text-muted-foreground">
              {steps.map((label, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                  {label}
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
                {steps.length > 0 ? "Drafting…" : "Thinking…"}
              </div>
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
