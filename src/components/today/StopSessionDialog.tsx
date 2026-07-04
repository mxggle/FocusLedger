import { FormEvent, useEffect, useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { Button } from "../ui/Button";
import { Dialog, DialogDescription, DialogTitle } from "../ui/Dialog";
import { Field, Input, Textarea } from "../ui/Field";

export function StopSessionDialog({
  open,
  onOpenChange,
  taskId,
  getElapsedSeconds,
  onDone,
  hasSession = true
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional task target when the dialog is opened from a task card. */
  taskId?: string;
  /** Snapshot of the live session length, read before the save clears focus. */
  getElapsedSeconds?: () => number;
  /** Fires after a successful "done" save, with the session length in seconds. */
  onDone?: (seconds: number) => void;
  /** False when the task was never worked on — the copy drops the "session"
   *  framing and pausing (meaningless for an unstarted task) is hidden. */
  hasSession?: boolean;
}) {
  const stopActiveTask = useTaskStore((state) => state.stopActiveTask);
  const [note, setNote] = useState("");
  const [blocker, setBlocker] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [completionRate, setCompletionRate] = useState("");
  const [saving, setSaving] = useState(false);

  // Start each stop flow clean. The shared focus-pane instance serves whatever
  // task is focused, so a draft abandoned for task A must never resurface when
  // task B is stopped.
  useEffect(() => {
    if (!open) return;
    setNote("");
    setBlocker("");
    setNextAction("");
    setCompletionRate("");
    setSaving(false);
  }, [open]);

  const hasCompletionRate = completionRate.trim() !== "";
  const parsedCompletionRate = Number(completionRate);
  // Empty is allowed (the field is optional); only flag an out-of-range value.
  const completionRateValid =
    !hasCompletionRate ||
    (Number.isFinite(parsedCompletionRate) &&
      parsedCompletionRate >= 0 &&
      parsedCompletionRate <= 100);

  async function save(outcome: "paused" | "done" | "dropped") {
    if (!completionRateValid || saving) return;
    // Capture the session length now — the save clears the focused task, so the
    // celebration can't read it afterwards.
    const elapsedAtDone = outcome === "done" ? getElapsedSeconds?.() ?? 0 : 0;
    setSaving(true);
    const result = await stopActiveTask(
      outcome,
      {
        note,
        blocker,
        next_action: nextAction,
        completion_rate: hasCompletionRate ? parsedCompletionRate : null
      },
      taskId
    );
    setSaving(false);
    if (!result.ok) return;
    setNote("");
    setBlocker("");
    setNextAction("");
    setCompletionRate("");
    onOpenChange(false);
    if (outcome === "done") onDone?.(elapsedAtDone);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save("done");
  }

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onOpenChange(false)}
      size="md"
      className="p-6"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle className="text-lg">
          {hasSession ? "What did this time buy you?" : "Mark as done"}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm">
          {hasSession
            ? "A quick, honest note before you stop."
            : "No time tracked yet — add an optional note for the record."}
        </DialogDescription>
        <div className="mt-5 grid gap-4">
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
            error={
              completionRateValid
                ? undefined
                : "Completion rate must be between 0 and 100."
            }
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
        </div>
        {/* Destructive path sits alone on the left, visually demoted; the
            primary "Mark as done" holds the conventional rightmost slot. */}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void save("dropped")}
            disabled={!completionRateValid || saving}
            className="mr-auto text-destructive hover:bg-destructive-soft hover:text-destructive"
          >
            Drop task
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          {hasSession ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void save("paused")}
              disabled={!completionRateValid || saving}
              loading={saving}
            >
              Save &amp; pause
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={!completionRateValid || saving}
          >
            Mark as done
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
