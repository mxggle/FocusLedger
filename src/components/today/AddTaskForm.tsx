import { ChevronDown, Plus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import type { TaskPriority } from "../../types";
import { toDateKey } from "../../utils/date";
import { Button } from "../ui/Button";
import { Field, Input, Select } from "../ui/Field";

export function AddTaskForm() {
  const categories = useTaskStore((state) => state.categories);
  const createTask = useTaskStore((state) => state.createTask);
  const defaultCategoryId = useSettingsStore((state) => state.settings.defaultCategoryId);
  const [title, setTitle] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("inbox");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [dueDate, setDueDate] = useState(toDateKey());

  useEffect(() => {
    setCategoryId(defaultCategoryId || "inbox");
  }, [defaultCategoryId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createTask({
      title,
      category_id: categoryId || "inbox",
      priority,
      estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      due_date: dueDate || toDateKey()
    });
    setTitle("");
    setEstimatedMinutes("");
    setPriority("medium");
    setCategoryId(defaultCategoryId || "inbox");
    setDueDate(toDateKey());
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded-md border bg-background p-3">
      <div className="mb-2 text-sm font-semibold">Today Tasks</div>
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Prepare interview self-introduction"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={!title.trim()}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      <button
        type="button"
        onClick={() => setAdvancedOpen((value) => !value)}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition ${advancedOpen ? "rotate-180" : ""}`} />
        Advanced fields
      </button>
      {advancedOpen ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
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
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>
      ) : null}
    </form>
  );
}
