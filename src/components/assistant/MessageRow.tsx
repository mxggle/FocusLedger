import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { formatAssistantContentForDisplay } from "../../services/ai/assistant/toolDisplay";
import type { ChatMessage } from "../../services/ai/assistant/types";
import { useAssistantStore } from "../../stores/assistantStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import { Markdown } from "../ui/Markdown";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { MessageEditor } from "./MessageEditor";
import { ToolCallCard } from "./ToolCallCard";

type MessageRowProps = {
  message: ChatMessage;
  isStreaming: boolean;
};

export function MessageRow({ message, isStreaming }: MessageRowProps) {
  if (message.role === "user") {
    return <UserRow message={message} />;
  }
  return <AssistantRow message={message} isStreaming={isStreaming} />;
}

function AssistantRow({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) {
  const messages = useAssistantStore((s) => s.messages);
  const status = useAssistantStore((s) => s.status);
  const regenerateLast = useAssistantStore((s) => s.regenerateLast);
  const applyToolCall = useAssistantStore((s) => s.applyToolCall);
  const applyAllToolCalls = useAssistantStore((s) => s.applyAllToolCalls);
  const revertToolCall = useAssistantStore((s) => s.revertToolCall);
  const dismissToolCall = useAssistantStore((s) => s.dismissToolCall);
  const allTasks = useTaskStore((s) => s.allTasks);
  const addToast = useUiStore((s) => s.addToast);

  const lastAssistantId = findLastAssistantId(messages);
  const canRegenerate = status === "idle" && lastAssistantId === message.id;
  const displayContent = formatAssistantContentForDisplay(message.content, message.toolCalls ?? [], allTasks);

  async function copy() {
    try {
      await writeText(displayContent);
      addToast({ kind: "success", title: "Copied" });
    } catch {
      addToast({ kind: "error", title: "Could not copy" });
    }
  }

  return (
    <div className="group relative flex gap-2.5">
      <div className="flex flex-col items-center gap-1">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-3 w-3" />
        </span>
        <span className="text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {formatTime(message.createdAt)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="text-sm leading-relaxed text-foreground">
          <Markdown content={displayContent} />
          {isStreaming ? (
            <span
              data-streaming-caret
              aria-hidden="true"
              className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-primary align-middle"
            />
          ) : null}
        </div>

        {message.stopped ? (
          <p className="text-xs text-muted-foreground">Stopped</p>
        ) : null}

        {message.toolCalls && message.toolCalls.length > 0 ? (
          <div className="flex flex-col gap-2">
            {applicableCount(message.toolCalls) >= 2 ? (
              <div className="flex justify-end">
                <Button size="sm" variant="primary" onClick={() => void applyAllToolCalls(message.id)}>
                  Apply all ({applicableCount(message.toolCalls)})
                </Button>
              </div>
            ) : null}
            {message.toolCalls.map((call) => (
              <ToolCallCard
                key={call.id}
                call={call}
                onApply={() => void applyToolCall(message.id, call.id)}
                onDismiss={() => dismissToolCall(message.id, call.id)}
                onRevert={() => void revertToolCall(message.id, call.id)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="absolute -top-1 right-0 flex gap-0.5 rounded-md bg-background/80 p-0.5 opacity-0 shadow-xs backdrop-blur-sm transition-opacity group-hover:opacity-100">
        <IconButton icon={Copy} label="Copy" variant="ghost" size="sm" onClick={() => void copy()} />
        <IconButton
          icon={RotateCcw}
          label="Regenerate"
          variant="ghost"
          size="sm"
          disabled={!canRegenerate}
          onClick={() => void regenerateLast()}
        />
      </div>
    </div>
  );
}

function UserRow({ message }: { message: ChatMessage }) {
  const status = useAssistantStore((s) => s.status);
  const editUserMessage = useAssistantStore((s) => s.editUserMessage);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="flex justify-end">
        <MessageEditor
          initialText={message.content}
          onSave={(text) => {
            setEditing(false);
            void editUserMessage(message.id, text);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-end gap-1">
      <IconButton
        icon={Pencil}
        label="Edit"
        variant="ghost"
        size="sm"
        disabled={status !== "idle"}
        onClick={() => setEditing(true)}
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      />
      <div className="max-w-[85%] rounded-lg border border-border bg-surface px-3.5 py-2 text-sm text-foreground">
        {message.content}
      </div>
    </div>
  );
}

/** How many queued cards "Apply all" would act on (pending or retryable failures). */
function applicableCount(calls: ChatMessage["toolCalls"]): number {
  return (calls ?? []).filter((call) => call.status === "pending" || call.status === "failed").length;
}

function findLastAssistantId(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return messages[i].id;
  }
  return null;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
