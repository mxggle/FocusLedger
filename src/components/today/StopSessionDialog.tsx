import { FormEvent, useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { Button } from "../ui/Button";
import { Dialog, DialogDescription, DialogTitle } from "../ui/Dialog";
import { Field, Input, Textarea } from "../ui/Field";

export function StopSessionDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stopActiveTask = useTaskStore((state) => state.stopActiveTask);
  const [note, setNote] = useState("");
  const [blocker, setBlocker] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [completionRate, setCompletionRate] = useState("50");
  const [saving, setSaving] = useState(false);

  const parsedCompletionRate = Number(completionRate);
  const completionRateValid =
    completionRate.trim() !== "" &&
    Number.isFinite(parsedCompletionRate) &&
    parsedCompletionRate >= 0 &&
    parsedCompletionRate <= 100;

  async function save(outcome: "paused" | "done" | "dropped") {
    if (!completionRateValid || saving) return;
    setSaving(true);
    const result = await stopActiveTask(outcome, {
      note,
      blocker,
      next_action: nextAction,
      completion_rate: parsedCompletionRate
    });
    setSaving(false);
    if (!result.ok) return;
    setNote("");
    setBlocker("");
    setNextAction("");
    setCompletionRate("50");
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save("paused");
  }

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onOpenChange(false)}
      size="md"
      className="p-6"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle className="text-lg">Wrap up this session</DialogTitle>
        <DialogDescription className="mt-1 text-sm">
          A quick reflection before you stop.
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
            label="Completion rate (0–100)"
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
              value={completionRate}
              onChange={(event) => setCompletionRate(event.target.value)}
            />
          </Field>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="secondary"
            disabled={!completionRateValid || saving}
            loading={saving}
          >
            Save &amp; pause
          </Button>
          <Button
            type="button"
            onClick={() => void save("done")}
            disabled={!completionRateValid || saving}
          >
            Mark as done
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => void save("dropped")}
            disabled={!completionRateValid || saving}
          >
            Drop task
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
