import {
  CalendarCheck,
  ChevronDown,
  Inbox,
  Plus,
  Sparkles,
  X
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useShortcutLabel } from "../../hooks/useShortcutLabel";
import { hasAiKey } from "../../services/ai/aiClient";
import { smartCaptureTask } from "../../services/ai/smartCapture";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { CreateTaskInput, TaskPriority } from "../../types";
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
  const addToast = useUiStore((state) => state.addToast);
  const categories = useTaskStore((state) => state.categories);
  const createTask = useTaskStore((state) => state.createTask);
  const settings = useSettingsStore((state) => state.settings);
  const defaultCategoryId = settings.defaultCategoryId;

  const shortcutLabel = useShortcutLabel();
  const [title, setTitle] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [destination, setDestination] = useState<Destination>("backlog");
  const [categoryId, setCategoryId] = useState("inbox");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // AI fills in the details from the captured text alone; opening the
  // advanced fields switches to fully manual entry.
  const aiEnabled = hasAiKey(settings) && !advancedOpen;

  useEffect(() => {
    setCategoryId(defaultCategoryId || "inbox");
  }, [defaultCategoryId]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let input: CreateTaskInput = {
      title,
      category_id: categoryId || "inbox",
      priority,
      estimated_minutes: parseEstimate(estimatedMinutes),
      due_date: destination === "today" ? toDateKey() : null
    };

    let aiError: string | null = null;
    if (aiEnabled) {
      setPending(true);
      try {
        input = await smartCaptureTask(settings, {
          text: title,
          categories,
          today: toDateKey(),
          defaultDueDate: destination === "today" ? toDateKey() : null
        });
        input.category_id = input.category_id ?? (defaultCategoryId || "inbox");
      } catch (error) {
        aiError = error instanceof Error ? error.message : "AI capture failed";
      } finally {
        setPending(false);
      }
    }

    const result = await createTask(input);
    if (!result.ok) return;
    if (aiError) {
      addToast({
        kind: "error",
        title: "Added without AI details",
        description: aiError
      });
    }

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
            placeholder={
              aiEnabled
                ? "Capture a task or idea — AI fills in the details"
                : "Capture a task or idea…"
            }
            className="h-11 min-w-0 flex-1 text-base"
          />
          <Button
            type="submit"
            size="lg"
            loading={pending}
            disabled={!title.trim()}
          >
            {pending ? null : aiEnabled ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((value) => !value)}
          aria-expanded={advancedOpen}
          className="mt-3 flex items-center gap-1 rounded px-5 pb-4 text-xs font-medium text-muted-foreground outline-none transition-colors duration-fast hover:text-foreground focus-visible:shadow-ring"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-fast ${
              advancedOpen ? "rotate-180" : ""
            }`}
          />
          Advanced fields
        </button>

        {advancedOpen ? (
          <div className="grid gap-4 border-t border-border bg-surface-2/60 px-5 py-4 md:grid-cols-[auto_1fr_140px_120px]">
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
        ) : null}
      </form>
    </Dialog>
  );
}
