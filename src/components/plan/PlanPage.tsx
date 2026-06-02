import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { validateTemplateSchedule } from "../../services/scheduleConflictService";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { RecurrenceType, TaskPriority, TaskTemplate } from "../../types";
import { formatDurationCompact } from "../../utils/duration";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Field, Input, Select } from "../ui/Field";
import { Switch } from "../ui/Switch";

const weekDays = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" }
];

function formatRecurrence(template: Pick<TaskTemplate, "recurrence_type" | "recurrence_days">): string {
  if (template.recurrence_type === "daily") {
    return "Every day";
  }

  if (template.recurrence_type === "weekdays") {
    return "Weekdays";
  }

  const labels = weekDays.filter((day) => template.recurrence_days.includes(day.value)).map((day) => day.label);
  return labels.length > 0 ? labels.join(", ") : "No days";
}

function formatTimeRange(template: Pick<TaskTemplate, "planned_start_time" | "planned_end_time">): string {
  return template.planned_end_time
    ? `${template.planned_start_time}-${template.planned_end_time}`
    : template.planned_start_time;
}

function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort((a, b) => a - b);
}

function parseEstimate(value: string): number | null {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : null;
}

function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {weekDays.map((day) => (
        <button
          key={day.value}
          type="button"
          onClick={() => onChange(toggleDay(days, day.value))}
          className={`h-8 rounded-md border px-2 text-xs font-medium transition ${
            days.includes(day.value) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
          }`}
        >
          {day.label}
        </button>
      ))}
    </div>
  );
}

export function PlanPage() {
  const categories = useTaskStore((state) => state.categories);
  const templates = useTaskStore((state) => state.scheduleTemplates);
  const createTemplate = useTaskStore((state) => state.createScheduleTemplate);
  const defaultCategoryId = useSettingsStore((state) => state.settings.defaultCategoryId);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("inbox");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [estimate, setEstimate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("daily");
  const [recurrenceDays, setRecurrenceDays] = useState([1, 2, 3, 4, 5]);
  const validation = useMemo(
    () =>
      validateTemplateSchedule(
        {
          title,
          planned_start_time: startTime,
          planned_end_time: endTime || null,
          estimated_minutes: parseEstimate(estimate),
          recurrence_type: recurrenceType,
          recurrence_days: recurrenceType === "weekly" ? recurrenceDays : []
        },
        templates
      ),
    [endTime, estimate, recurrenceDays, recurrenceType, startTime, templates, title]
  );

  useEffect(() => {
    setCategoryId(defaultCategoryId || "inbox");
  }, [defaultCategoryId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await createTemplate({
      title,
      category_id: categoryId || "inbox",
      priority,
      estimated_minutes: parseEstimate(estimate),
      planned_start_time: startTime,
      planned_end_time: endTime || null,
      recurrence_type: recurrenceType,
      recurrence_days: recurrenceType === "weekly" ? recurrenceDays : []
    });
    if (!result.ok) {
      return;
    }
    setTitle("");
    setEstimate("");
    setStartTime("09:00");
    setEndTime("");
    setPriority("medium");
    setRecurrenceType("daily");
    setRecurrenceDays([1, 2, 3, 4, 5]);
    setCategoryId(defaultCategoryId || "inbox");
  }

  return (
    <div className="h-full overflow-auto px-8 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-normal">Plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">Reusable tasks that generate today's task list.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mb-5 rounded-md border bg-background p-4">
          <div className="mb-3 text-sm font-semibold">New plan item</div>
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_140px_140px_150px]">
            <Field label="Title">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Japanese study" />
            </Field>
            <Field label="Start">
              <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </Field>
            <Field label="End">
              <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </Field>
            <Field label="Repeat">
              <Select value={recurrenceType} onChange={(event) => setRecurrenceType(event.target.value as RecurrenceType)}>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Custom week</option>
              </Select>
            </Field>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[180px_160px_1fr]">
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
              <Input type="number" min="1" value={estimate} onChange={(event) => setEstimate(event.target.value)} placeholder="45" />
            </Field>
          </div>

          {recurrenceType === "weekly" ? (
            <div className="mt-3">
              <div className="mb-1.5 text-sm font-medium text-muted-foreground">Days</div>
              <DayPicker days={recurrenceDays} onChange={setRecurrenceDays} />
            </div>
          ) : null}

          {!validation.ok ? (
            <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {validation.message}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={!title.trim() || !startTime || !validation.ok}>
              <Plus className="h-4 w-4" />
              Add plan
            </Button>
          </div>
        </form>

        <div className="space-y-2">
          {templates.length === 0 ? (
            <div className="rounded-md border bg-background p-6 text-center text-sm text-muted-foreground">
              No plan items yet.
            </div>
          ) : (
            templates.map((template) => <PlanItem key={template.id} template={template} />)
          )}
        </div>
      </div>
    </div>
  );
}

function PlanItem({ template }: { template: TaskTemplate }) {
  const categories = useTaskStore((state) => state.categories);
  const updateTemplate = useTaskStore((state) => state.updateScheduleTemplate);
  const deleteTemplate = useTaskStore((state) => state.deleteScheduleTemplate);
  const confirm = useUiStore((state) => state.confirm);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(template.title);
  const [categoryId, setCategoryId] = useState(template.category_id ?? "inbox");
  const [priority, setPriority] = useState<TaskPriority>(template.priority);
  const [estimate, setEstimate] = useState(template.estimated_minutes?.toString() ?? "");
  const [startTime, setStartTime] = useState(template.planned_start_time);
  const [endTime, setEndTime] = useState(template.planned_end_time ?? "");
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(template.recurrence_type);
  const [recurrenceDays, setRecurrenceDays] = useState(template.recurrence_days);
  const category = categories.find((item) => item.id === template.category_id);
  const templates = useTaskStore((state) => state.scheduleTemplates);
  const validation = useMemo(
    () =>
      validateTemplateSchedule(
        {
          ...template,
          title,
          planned_start_time: startTime,
          planned_end_time: endTime || null,
          estimated_minutes: parseEstimate(estimate),
          recurrence_type: recurrenceType,
          recurrence_days: recurrenceType === "weekly" ? recurrenceDays : []
        },
        templates,
        template.id
      ),
    [endTime, estimate, recurrenceDays, recurrenceType, startTime, template, templates, title]
  );

  async function saveEdit() {
    const result = await updateTemplate(template.id, {
      title,
      category_id: categoryId,
      priority,
      estimated_minutes: parseEstimate(estimate),
      planned_start_time: startTime,
      planned_end_time: endTime || null,
      recurrence_type: recurrenceType,
      recurrence_days: recurrenceType === "weekly" ? recurrenceDays : []
    });
    if (!result.ok) {
      return;
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-md border bg-background p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_140px_140px_150px]">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Start">
            <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </Field>
          <Field label="End">
            <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </Field>
          <Field label="Repeat">
            <Select value={recurrenceType} onChange={(event) => setRecurrenceType(event.target.value as RecurrenceType)}>
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Custom week</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[180px_160px_1fr]">
          <Field label="Category">
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
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
            <Input type="number" min="1" value={estimate} onChange={(event) => setEstimate(event.target.value)} />
          </Field>
        </div>
        {recurrenceType === "weekly" ? (
          <div className="mt-3">
            <div className="mb-1.5 text-sm font-medium text-muted-foreground">Days</div>
            <DayPicker days={recurrenceDays} onChange={setRecurrenceDays} />
          </div>
        ) : null}
        {!validation.ok ? (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {validation.message}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button type="button" onClick={saveEdit} disabled={!title.trim() || !startTime || !validation.ok}>
            <Check className="h-4 w-4" />
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold">{formatTimeRange(template)}</div>
            <h3 className="truncate text-sm font-semibold">{template.title}</h3>
            <Badge>{formatRecurrence(template)}</Badge>
            {!validation.ok ? <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200">Conflict</Badge> : null}
            {!template.enabled ? <Badge className="bg-zinc-100 text-zinc-600">Off</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{category?.name ?? "Inbox"}</span>
            <span>{template.priority}</span>
            {template.estimated_minutes ? <span>Estimate {formatDurationCompact(template.estimated_minutes * 60)}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={template.enabled} onChange={(enabled) => void updateTemplate(template.id, { enabled })} />
          <Button type="button" size="icon" variant="secondary" onClick={() => setEditing(true)} aria-label="Edit plan item">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => {
              void (async () => {
                if (
                  await confirm({
                    title: "Delete plan item",
                    message: "Delete this plan item? Existing task history will stay.",
                    confirmLabel: "Delete",
                    danger: true
                  })
                ) {
                  await deleteTemplate(template.id);
                }
              })();
            }}
            aria-label="Delete plan item"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
