import { CalendarCheck, Inbox, Plus, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { TaskPriority } from "../../types";
import { toDateKey } from "../../utils/date";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";
import { Field, Input, Select } from "../ui/Field";

type Destination = "backlog" | "today";

function parseEstimate(value: string): number | null {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function QuickAddDialog() {
  const open = useUiStore((state) => state.quickAddOpen);
  const close = useUiStore((state) => state.closeQuickAdd);
  const categories = useTaskStore((state) => state.categories);
  const createTask = useTaskStore((state) => state.createTask);
  const defaultCategoryId = useSettingsStore((state) => state.settings.defaultCategoryId);
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState<Destination>("backlog");
  const [categoryId, setCategoryId] = useState("inbox");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCategoryId(defaultCategoryId || "inbox");
  }, [defaultCategoryId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await createTask({
      title,
      category_id: categoryId || "inbox",
      priority,
      estimated_minutes: parseEstimate(estimatedMinutes),
      due_date: destination === "today" ? toDateKey() : null
    });

    if (!result.ok) {
      return;
    }

    setTitle("");
    setEstimatedMinutes("");
    setPriority("medium");
    setDestination("backlog");
    setCategoryId(defaultCategoryId || "inbox");
    close();
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-[12vh]">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-md border bg-background p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Quick add</h2>
            <p className="mt-1 text-xs text-muted-foreground">Cmd/Ctrl+K opens this in the app.</p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={close} aria-label="Close quick add">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Capture a task or idea"
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={!title.trim()}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_120px_120px]">
          <Field label="Destination">
            <div className="grid grid-cols-2 rounded-md border bg-muted/40 p-1">
              <DestinationButton
                active={destination === "backlog"}
                icon={Inbox}
                label="Backlog"
                onClick={() => setDestination("backlog")}
              />
              <DestinationButton
                active={destination === "today"}
                icon={CalendarCheck}
                label="Today"
                onClick={() => setDestination("today")}
              />
            </div>
          </Field>
          <Field label="Category">
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Field label="Estimate">
            <Input
              type="number"
              min="1"
              value={estimatedMinutes}
              onChange={(event) => setEstimatedMinutes(event.target.value)}
              placeholder="45"
            />
          </Field>
        </div>
      </form>
    </div>
  );
}

function DestinationButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: typeof Inbox;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium transition",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
