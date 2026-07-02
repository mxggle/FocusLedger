import { ChevronDown, Plus, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { hasAiKey } from "../../services/ai/aiClient";
import { smartCaptureTask } from "../../services/ai/smartCapture";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { CreateTaskInput, TaskPriority } from "../../types";
import { toDateKey } from "../../utils/date";
import { Button } from "../ui/Button";
import { Field, Input, Select } from "../ui/Field";

export function AddTaskForm() {
  const categories = useTaskStore((state) => state.categories);
  const createTask = useTaskStore((state) => state.createTask);
  const settings = useSettingsStore((state) => state.settings);
  const addToast = useUiStore((state) => state.addToast);
  const defaultCategoryId = settings.defaultCategoryId;
  const [title, setTitle] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [categoryId, setCategoryId] = useState("inbox");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [dueDate, setDueDate] = useState(toDateKey());

  // AI fills in the details from the title alone; opening the advanced
  // fields switches to fully manual entry.
  const aiEnabled = hasAiKey(settings) && !advancedOpen;

  useEffect(() => {
    setCategoryId(defaultCategoryId || "inbox");
  }, [defaultCategoryId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Guard against re-entry: AI capture takes seconds, and a second submit
    // (e.g. Enter in the input) would create a duplicate task.
    if (pending) return;
    let input: CreateTaskInput = {
      title,
      category_id: categoryId || "inbox",
      priority,
      estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      due_date: dueDate || toDateKey()
    };

    let aiError: string | null = null;
    if (aiEnabled) {
      setPending(true);
      try {
        const captured = await smartCaptureTask(settings, {
          text: title,
          categories,
          today: toDateKey(),
          defaultDueDate: toDateKey()
        });
        input = {
          ...captured,
          category_id: captured.category_id ?? (defaultCategoryId || "inbox")
        };
      } catch (error) {
        aiError = error instanceof Error ? error.message : "AI capture failed";
      } finally {
        setPending(false);
      }
    }

    const result = await createTask(input);
    if (!result.ok) return;
    if (aiError) {
      // Only claim "added" once the create actually succeeded.
      addToast({
        kind: "error",
        title: "Added without AI details",
        description: aiError
      });
    }
    setTitle("");
    setEstimatedMinutes("");
    setPriority("medium");
    setCategoryId(defaultCategoryId || "inbox");
    setDueDate(toDateKey());
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-5 rounded-xl border border-border bg-surface p-4 shadow-card"
    >
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Add to today
      </div>
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={
            aiEnabled ? "What needs to get done? AI fills in the details" : "What needs to get done?"
          }
          className="min-w-0 flex-1"
        />
        <Button type="submit" loading={pending} disabled={!title.trim()}>
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
        className="mt-3 flex items-center gap-1 rounded text-xs font-medium text-muted-foreground outline-none transition-colors duration-fast hover:text-foreground focus-visible:shadow-ring"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-fast ${
            advancedOpen ? "rotate-180" : ""
          }`}
        />
        Advanced fields
      </button>
      {advancedOpen ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
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
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
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
          <Field label="Due date">
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
        </div>
      ) : null}
    </form>
  );
}
