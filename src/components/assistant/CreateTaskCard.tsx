import { CalendarClock, Check, Inbox, Plus } from "lucide-react";
import type { CreateTaskInput, TaskPriority } from "../../types";
import { useTaskStore } from "../../stores/taskStore";
import { useAssistantStore } from "../../stores/assistantStore";
import type { ProposedAction } from "../../services/ai/assistant/types";
import { Button } from "../ui/Button";
import { Input, Select } from "../ui/Field";

type CreateTaskCardProps = {
  messageId: string;
  action: ProposedAction;
  onApply: () => void;
  onDismiss: () => void;
};

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
];

/**
 * A rich, inline-editable proposal for a new task — the assistant drafts it,
 * the user tweaks any field, then commits it straight into the task list.
 */
export function CreateTaskCard({ messageId, action, onApply, onDismiss }: CreateTaskCardProps) {
  const categories = useTaskStore((state) => state.categories);
  const today = useTaskStore((state) => state.selectedDate);
  const update = useAssistantStore((state) => state.updateActionParams);

  const params = action.params as CreateTaskInput;
  const editable = action.status === "pending";

  function set(patch: Partial<CreateTaskInput>) {
    update(messageId, action.id, patch as Record<string, unknown>);
  }

  if (!editable) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm opacity-70">
        <Plus className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-foreground">{params.title}</p>
        <span className="shrink-0 text-xs capitalize text-muted-foreground">{action.status}</span>
      </div>
    );
  }

  const inBacklog = !params.due_date;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-xs">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Plus className="h-3.5 w-3.5 text-primary" />
        New task
      </div>

      <Input
        value={params.title ?? ""}
        onChange={(event) => set({ title: event.target.value })}
        placeholder="Task title"
        aria-label="Task title"
        className="font-medium"
      />

      <textarea
        value={params.description ?? ""}
        onChange={(event) => set({ description: event.target.value || null })}
        placeholder="Add detail or acceptance notes (optional)"
        aria-label="Description"
        rows={2}
        className="w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm leading-relaxed text-foreground shadow-xs outline-none placeholder:text-subtle hover:border-border-strong focus:border-ring focus:shadow-ring"
      />

      <div className="grid grid-cols-3 gap-2">
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-muted-foreground">Priority</span>
          <Select
            value={params.priority ?? ""}
            onChange={(event) =>
              set({ priority: (event.target.value || undefined) as TaskPriority | undefined })
            }
            aria-label="Priority"
          >
            <option value="">None</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="grid gap-1 text-xs">
          <span className="font-medium text-muted-foreground">Estimate</span>
          <Input
            type="number"
            min={0}
            step={5}
            value={params.estimated_minutes ?? ""}
            onChange={(event) =>
              set({
                estimated_minutes: event.target.value ? Number(event.target.value) : null
              })
            }
            placeholder="min"
            aria-label="Estimated minutes"
          />
        </label>

        <label className="grid gap-1 text-xs">
          <span className="font-medium text-muted-foreground">Category</span>
          <Select
            value={params.category_id ?? ""}
            onChange={(event) => set({ category_id: event.target.value || null })}
            aria-label="Category"
          >
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => set({ due_date: null })}
          className={
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors " +
            (inBacklog
              ? "border-primary bg-primary-soft text-primary-soft-foreground"
              : "border-border text-muted-foreground hover:bg-muted")
          }
        >
          <Inbox className="h-3.5 w-3.5" /> Backlog
        </button>
        <button
          type="button"
          onClick={() => set({ due_date: today })}
          className={
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors " +
            (params.due_date === today
              ? "border-primary bg-primary-soft text-primary-soft-foreground"
              : "border-border text-muted-foreground hover:bg-muted")
          }
        >
          <CalendarClock className="h-3.5 w-3.5" /> Today
        </button>
        <Input
          type="date"
          value={params.due_date ?? ""}
          onChange={(event) => set({ due_date: event.target.value || null })}
          aria-label="Due date"
          className="h-8 w-auto flex-1 text-xs"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
        <Button size="sm" variant="primary" onClick={onApply}>
          <Check className="h-3.5 w-3.5" /> Add to list
        </Button>
      </div>
    </div>
  );
}
