import { Check, CalendarClock, Pencil, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { validateTemplateSchedule } from "../../services/scheduleConflictService";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { RecurrenceType, TaskPriority, TaskTemplate } from "../../types";
import { formatDurationCompact } from "../../utils/duration";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input, Select } from "../ui/Field";
import { IconButton } from "../ui/IconButton";
import { PageHeader } from "../ui/PageHeader";
import { Switch } from "../ui/Switch";
import { cn } from "../../utils/cn";
import { resolveCategoryColor } from "../../utils/category";

const weekDays = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" }
];

function formatRecurrence(
  template: Pick<TaskTemplate, "recurrence_type" | "recurrence_days">
): string {
  if (template.recurrence_type === "daily") return "Every day";
  if (template.recurrence_type === "weekdays") return "Weekdays";
  const labels = weekDays
    .filter((day) => template.recurrence_days.includes(day.value))
    .map((day) => day.label);
  return labels.length > 0 ? labels.join(", ") : "No days";
}

function formatTimeRange(
  template: Pick<TaskTemplate, "planned_start_time" | "planned_end_time">
): string {
  if (!template.planned_start_time) return "Anytime";
  return template.planned_end_time
    ? `${template.planned_start_time}–${template.planned_end_time}`
    : template.planned_start_time;
}

function toggleDay(days: number[], day: number): number[] {
  return days.includes(day)
    ? days.filter((value) => value !== day)
    : [...days, day].sort((a, b) => a - b);
}

function parseEstimate(value: string): number | null {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : null;
}

function DayPicker({
  days,
  onChange
}: {
  days: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {weekDays.map((day) => {
        const selected = days.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(toggleDay(days, day.value))}
            className={cn(
              "h-9 w-11 rounded-lg border text-xs font-semibold outline-none",
              "transition-[background-color,border-color,box-shadow,transform] duration-fast active:scale-95 focus-visible:shadow-ring",
              selected
                ? "border-primary bg-primary bg-gradient-accent text-primary-foreground shadow-sm"
                : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground"
            )}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}

export function PlanPage() {
  const categories = useTaskStore((state) => state.categories);
  const templates = useTaskStore((state) => state.scheduleTemplates);
  const createTemplate = useTaskStore((state) => state.createScheduleTemplate);
  const defaultCategoryId = useSettingsStore(
    (state) => state.settings.defaultCategoryId
  );

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("inbox");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [estimate, setEstimate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("daily");
  const [recurrenceDays, setRecurrenceDays] = useState([1, 2, 3, 4, 5]);

  const validation = useMemo(
    () =>
      validateTemplateSchedule(
        {
          title,
          planned_start_time: startTime || null,
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
      planned_start_time: startTime || null,
      planned_end_time: endTime || null,
      recurrence_type: recurrenceType,
      recurrence_days: recurrenceType === "weekly" ? recurrenceDays : []
    });
    if (!result.ok) return;
    setTitle("");
    setEstimate("");
    setStartTime("");
    setEndTime("");
    setPriority("medium");
    setRecurrenceType("daily");
    setRecurrenceDays([1, 2, 3, 4, 5]);
    setCategoryId(defaultCategoryId || "inbox");
  }

  return (
    <div className="h-full overflow-auto px-6 py-7">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          icon={CalendarClock}
          eyebrow="Plan"
          title="Recurring tasks"
          description="Reusable tasks that generate today's task list automatically."
        />

        {/* New plan form */}
        <form
          onSubmit={handleSubmit}
          className="mb-7 rounded-xl border border-border bg-surface p-5 shadow-card"
        >
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            New plan item
          </div>
          {/* Row 1: Title (grows) | Start | End | Repeat */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px_140px]">
            <Field label="Title">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Japanese study"
              />
            </Field>
            <Field label="Start">
              <Input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </Field>
            <Field label="End">
              <Input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </Field>
            <Field label="Repeat">
              <Select
                value={recurrenceType}
                onChange={(event) =>
                  setRecurrenceType(event.target.value as RecurrenceType)
                }
              >
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Custom week</option>
              </Select>
            </Field>
          </div>

          {/* Row 2: Category | Priority | Estimate — same column cadence as row 1 */}
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px_140px]">
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
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                placeholder="45"
              />
            </Field>
            {/* Empty 4th cell keeps columns aligned with row 1 */}
            <div aria-hidden="true" />
          </div>

          {recurrenceType === "weekly" ? (
            <div className="mt-3">
              <div className="mb-2 text-sm font-medium text-muted-foreground">
                Days
              </div>
              <DayPicker days={recurrenceDays} onChange={setRecurrenceDays} />
            </div>
          ) : null}

          {!validation.ok ? (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground">
              {validation.message}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              disabled={!title.trim() || !validation.ok}
            >
              <Plus className="h-4 w-4" />
              Add plan
            </Button>
          </div>
        </form>

        {/* Template list */}
        <div className="space-y-3">
          {templates.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No plan items yet."
              hint="Add a recurring task above to generate today's tasks automatically."
              dashed
            />
          ) : (
            templates.map((template) => (
              <PlanItem key={template.id} template={template} />
            ))
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
  const templates = useTaskStore((state) => state.scheduleTemplates);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(template.title);
  const [categoryId, setCategoryId] = useState(template.category_id ?? "inbox");
  const [priority, setPriority] = useState<TaskPriority>(template.priority);
  const [estimate, setEstimate] = useState(
    template.estimated_minutes?.toString() ?? ""
  );
  const [startTime, setStartTime] = useState(template.planned_start_time ?? "");
  const [endTime, setEndTime] = useState(template.planned_end_time ?? "");
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    template.recurrence_type
  );
  const [recurrenceDays, setRecurrenceDays] = useState(template.recurrence_days);

  const category = categories.find((item) => item.id === template.category_id);
  const categoryColor = resolveCategoryColor(category?.color);

  const validation = useMemo(
    () =>
      validateTemplateSchedule(
        {
          ...template,
          title,
          planned_start_time: startTime || null,
          planned_end_time: endTime || null,
          estimated_minutes: parseEstimate(estimate),
          recurrence_type: recurrenceType,
          recurrence_days: recurrenceType === "weekly" ? recurrenceDays : []
        },
        templates,
        template.id
      ),
    [
      endTime,
      estimate,
      recurrenceDays,
      recurrenceType,
      startTime,
      template,
      templates,
      title
    ]
  );

  async function saveEdit() {
    const result = await updateTemplate(template.id, {
      title,
      category_id: categoryId,
      priority,
      estimated_minutes: parseEstimate(estimate),
      planned_start_time: startTime || null,
      planned_end_time: endTime || null,
      recurrence_type: recurrenceType,
      recurrence_days: recurrenceType === "weekly" ? recurrenceDays : []
    });
    if (!result.ok) return;
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px_140px]">
          <Field label="Title">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Start">
            <Input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </Field>
          <Field label="End">
            <Input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </Field>
          <Field label="Repeat">
            <Select
              value={recurrenceType}
              onChange={(event) =>
                setRecurrenceType(event.target.value as RecurrenceType)
              }
            >
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Custom week</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px_140px]">
          <Field label="Category">
            <Select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
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
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
            />
          </Field>
          <div aria-hidden="true" />
        </div>
        {recurrenceType === "weekly" ? (
          <div className="mt-3">
            <div className="mb-2 text-sm font-medium text-muted-foreground">
              Days
            </div>
            <DayPicker days={recurrenceDays} onChange={setRecurrenceDays} />
          </div>
        ) : null}
        {!validation.ok ? (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground">
            {validation.message}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setEditing(false)}
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={saveEdit}
            disabled={!title.trim() || !validation.ok}
          >
            <Check className="h-4 w-4" />
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-surface p-4 pl-5 shadow-card transition-[box-shadow,border-color,transform] duration-fast hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md",
        !template.enabled && "opacity-70"
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: template.enabled ? categoryColor : "hsl(var(--border))" }}
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-muted px-2.5 py-1.5 text-center ring-1 ring-inset ring-border">
            {template.planned_start_time ? (
              <>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {template.planned_start_time}
                </span>
                {template.planned_end_time ? (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {template.planned_end_time}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">Anytime</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {template.title}
              </h3>
              <Badge variant="primary">{formatRecurrence(template)}</Badge>
              {!validation.ok ? <Badge variant="danger" dot>Conflict</Badge> : null}
              {!template.enabled ? <Badge variant="neutral">Off</Badge> : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CategoryDot color={category?.color} />
                {category?.name ?? "Inbox"}
              </span>
              <span className="capitalize">{template.priority}</span>
              {template.estimated_minutes ? (
                <span className="tabular-nums">
                  {formatDurationCompact(template.estimated_minutes * 60)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={template.enabled}
            onChange={(enabled) => void updateTemplate(template.id, { enabled })}
            label={template.enabled ? "Enabled" : "Disabled"}
          />
          <IconButton
            icon={Pencil}
            label="Edit plan item"
            variant="secondary"
            onClick={() => setEditing(true)}
          />
          <IconButton
            icon={Trash2}
            label="Delete plan item"
            onClick={() => {
              void (async () => {
                if (
                  await confirm({
                    title: "Delete plan item",
                    message:
                      "Delete this plan item? Existing task history will stay.",
                    confirmLabel: "Delete",
                    danger: true
                  })
                ) {
                  await deleteTemplate(template.id);
                }
              })();
            }}
          />
        </div>
      </div>
    </div>
  );
}
