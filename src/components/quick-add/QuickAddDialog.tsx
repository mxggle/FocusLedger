import { CalendarCheck, Inbox, Plus, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useShortcutLabel } from "../../hooks/useShortcutLabel";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { TaskPriority } from "../../types";
import { toDateKey } from "../../utils/date";
import { Button } from "../ui/Button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle
} from "../ui/Dialog";
import { Field, Input, Select } from "../ui/Field";
import { IconButton } from "../ui/IconButton";
import { SegmentedControl } from "../ui/SegmentedControl";

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
  const defaultCategoryId = useSettingsStore(
    (state) => state.settings.defaultCategoryId
  );

  const shortcutLabel = useShortcutLabel();
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
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await createTask({
      title,
      category_id: categoryId || "inbox",
      priority,
      estimated_minutes: parseEstimate(estimatedMinutes),
      due_date: destination === "today" ? toDateKey() : null
    });

    if (!result.ok) return;

    setTitle("");
    setEstimatedMinutes("");
    setPriority("medium");
    setDestination("backlog");
    setCategoryId(defaultCategoryId || "inbox");
    close();
  }

  return (
    <Dialog open={open} onClose={close} size="lg" align="top" className="p-0">
      <form onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <DialogTitle>Quick add</DialogTitle>
            <DialogDescription className="mt-0.5">
              Press{" "}
              <kbd className="rounded border border-border bg-muted px-1 py-px font-sans text-[10px] font-medium text-muted-foreground">
                {shortcutLabel}
              </kbd>{" "}
              to open this from anywhere.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <IconButton icon={X} label="Close quick add" />
          </DialogClose>
        </div>

        <div className="flex gap-2 px-5 pt-4">
          <Input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Capture a task or idea…"
            className="h-11 min-w-0 flex-1 text-base"
          />
          <Button type="submit" size="lg" disabled={!title.trim()}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        <div className="mt-5 grid gap-4 border-t border-border bg-surface-2/60 px-5 py-4 md:grid-cols-[auto_1fr_140px_120px]">
          <Field label="Destination">
            <SegmentedControl<Destination>
              value={destination}
              onChange={setDestination}
              segments={[
                { value: "backlog", label: "Backlog", icon: Inbox },
                { value: "today", label: "Today", icon: CalendarCheck }
              ]}
            />
          </Field>
          <Field label="Category">
            <Select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as TaskPriority)
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Field label="Estimate (min)">
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
    </Dialog>
  );
}
