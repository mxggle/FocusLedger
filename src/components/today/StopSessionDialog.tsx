import { FormEvent, useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { Button } from "../ui/Button";
import { Field, Input, Textarea } from "../ui/Field";

export function StopSessionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const stopActiveTask = useTaskStore((state) => state.stopActiveTask);
  const [note, setNote] = useState("");
  const [blocker, setBlocker] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [completionRate, setCompletionRate] = useState("50");

  if (!open) {
    return null;
  }

  async function save(outcome: "paused" | "done" | "dropped") {
    await stopActiveTask(outcome, {
      note,
      blocker,
      next_action: nextAction,
      completion_rate: Number(completionRate)
    });
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-md border bg-background p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Wrap up this session</h2>
        <div className="mt-4 grid gap-3">
          <Field label="What did you work on?">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <Field label="Any blocker?">
            <Textarea value={blocker} onChange={(event) => setBlocker(event.target.value)} />
          </Field>
          <Field label="Next action">
            <Input value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
          </Field>
          <Field label="Completion rate">
            <Input
              type="number"
              min="0"
              max="100"
              value={completionRate}
              onChange={(event) => setCompletionRate(event.target.value)}
            />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="secondary">
            Save and pause
          </Button>
          <Button type="button" onClick={() => void save("done")}>
            Mark as done
          </Button>
          <Button type="button" variant="danger" onClick={() => void save("dropped")}>
            Drop task
          </Button>
        </div>
      </form>
    </div>
  );
}
