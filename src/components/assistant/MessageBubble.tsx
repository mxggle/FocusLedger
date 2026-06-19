import { useAssistantStore } from "../../stores/assistantStore";
import type { ChatMessage } from "../../services/ai/assistant/types";
import { Markdown } from "../ui/Markdown";
import { ActionCard } from "./ActionCard";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const applyAction = useAssistantStore((state) => state.applyAction);
  const applyAll = useAssistantStore((state) => state.applyAll);
  const dismissAction = useAssistantStore((state) => state.dismissAction);

  const pendingCreates = (message.actions ?? []).filter(
    (action) => action.status === "pending" && action.type === "create_task"
  );

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-foreground">
        <Markdown content={message.content} />
      </div>
      {message.actions && message.actions.length > 0 ? (
        <div className="flex flex-col gap-2">
          {pendingCreates.length >= 2 ? (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-medium text-muted-foreground">
                Proposed plan — {pendingCreates.length} tasks
              </span>
              <button
                type="button"
                onClick={() => void applyAll(message.id)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Approve all
              </button>
            </div>
          ) : null}
          {message.actions.map((action) => (
            <ActionCard
              key={action.id}
              messageId={message.id}
              action={action}
              onApply={() => void applyAction(message.id, action.id)}
              onDismiss={() => dismissAction(message.id, action.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
