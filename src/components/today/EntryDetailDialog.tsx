import { format } from "date-fns";
import { FormEvent, useEffect, useState } from "react";
import { FALLBACK_CATEGORY_ID } from "../../db/categoryRepository";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import type { TimeEntryWithTask } from "../../types";
import { formatDurationCompact } from "../../utils/duration";
import { Button } from "../ui/Button";
import { CategoryDot } from "../ui/CategoryDot";
import { Dialog, DialogDescription, DialogTitle } from "../ui/Dialog";
import { Field, Input, Select, Textarea } from "../ui/Field";

export function EntryDetailDialog({
  entry,
  open,
  onClose
}: {
  entry: TimeEntryWithTask | null;
  open: boolean;
  onClose: () => void;
}) {
  const updateEntryDetails = useTaskStore((state) => state.updateEntryDetails);
  const updateTask = useTaskStore((state) => state.updateTask);
  const categories = useTaskStore((state) => state.categories);
  const now = useTimerStore((state) => state.now);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>(FALLBACK_CATEGORY_ID);
  const [note, setNote] = useState("");
  const [blocker, setBlocker] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [completionRate, setCompletionRate] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever a different entry is opened.
  useEffect(() => {
    setEditing(false);
    setTitle(entry?.task_title ?? "");
    setCategoryId(entry?.category_id ?? FALLBACK_CATEGORY_ID);
    setNote(entry?.note ?? "");
    setBlocker(entry?.blocker ?? "");
    setNextAction(entry?.next_action ?? "");
    setCompletionRate(entry?.completion_rate != null ? String(entry.completion_rate) : "");
  }, [entry?.id, open]);

  if (!entry) return null;

  const start = new Date(entry.start_at);
  const end = entry.end_at ? new Date(entry.end_at) : null;
  const ongoing = !entry.end_at;
  const durationSeconds =
    entry.duration_seconds ??
    Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const estimateMinutes = entry.task_estimated_minutes ?? 0;

  const titleValid = title.trim() !== "";
  const hasCompletionRate = completionRate.trim() !== "";
  const parsedCompletionRate = Number(completionRate);
  const completionRateValid =
    !hasCompletionRate ||
    (Number.isFinite(parsedCompletionRate) &&
      parsedCompletionRate >= 0 &&
      parsedCompletionRate <= 100);

  const hasReflection = Boolean(entry.note || entry.blocker || entry.next_action || entry.completion_rate != null);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entry || !titleValid || !completionRateValid || saving) return;
    setSaving(true);

    // Name and category live on the task, so this renames the task everywhere
    // it appears — not just this entry.
    const trimmedTitle = title.trim();
    const taskChanged =
      trimmedTitle !== entry.task_title ||
      categoryId !== (entry.category_id ?? FALLBACK_CATEGORY_ID);
    if (taskChanged) {
      const taskResult = await updateTask(entry.task_id, {
        title: trimmedTitle,
        category_id: categoryId
      });
      if (!taskResult.ok) {
        setSaving(false);
        return;
      }
    }

    const result = await updateEntryDetails(entry.id, {
      note: note.trim() || null,
      blocker: blocker.trim() || null,
      next_action: nextAction.trim() || null,
      completion_rate: hasCompletionRate ? parsedCompletionRate : null
    });
    setSaving(false);
    if (result.ok) setEditing(false);
  }

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} size="md" className="p-6">
      <DialogTitle className="text-lg">{entry.task_title}</DialogTitle>
      <DialogDescription className="mt-1 flex items-center gap-1.5 text-sm">
        <CategoryDot color={entry.category_color} />
        {entry.category_name ?? "Inbox"}
      </DialogDescription>

      {/* Session facts — always read-only. */}
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/40 p-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Time</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
            {format(start, "HH:mm")} – {end ? format(end, "HH:mm") : "now"}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Duration</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
            {formatDurationCompact(durationSeconds)}
            {estimateMinutes > 0 ? (
              <span className="font-normal text-muted-foreground"> / {formatDurationCompact(estimateMinutes * 60)}</span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Completion</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
            {entry.completion_rate != null ? `${entry.completion_rate}%` : "—"}
          </div>
        </div>
      </div>

      {editing ? (
        <form onSubmit={handleSave} className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Task name"
              error={titleValid ? undefined : "Task name is required."}
            >
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What is this task?"
                autoFocus
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
          </div>
          <Field label="What did you work on?">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="A short note on what got done…"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Any blocker?">
              <Textarea
                value={blocker}
                onChange={(event) => setBlocker(event.target.value)}
                placeholder="What got in the way?"
              />
            </Field>
            <Field label="Next action">
              <Textarea
                value={nextAction}
                onChange={(event) => setNextAction(event.target.value)}
                placeholder="Where to pick up next…"
              />
            </Field>
          </div>
          <Field
            label="Completion rate (optional, 0–100)"
            error={completionRateValid ? undefined : "Completion rate must be between 0 and 100."}
          >
            <Input
              type="number"
              min="0"
              max="100"
              placeholder="e.g. 80"
              value={completionRate}
              onChange={(event) => setCompletionRate(event.target.value)}
            />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!titleValid || !completionRateValid || saving} loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="mt-4 grid gap-3">
            <DetailSection label="What got done" value={entry.note} />
            <DetailSection label="Blocker" value={entry.blocker} />
            <DetailSection label="Next action" value={entry.next_action} />
            {!hasReflection ? (
              <p className="text-sm text-muted-foreground">
                {ongoing
                  ? "Session in progress — you can add a reflection when you stop."
                  : "No reflection yet. Add your thoughts on this session."}
              </p>
            ) : null}
          </div>
          <div className="mt-6 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            {!ongoing ? (
              <Button type="button" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Dialog>
  );
}

function DetailSection({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{value}</p>
    </div>
  );
}
