import { Brain, Pencil, Pin, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { MemoryEntry, MemoryKind } from "../../services/ai/assistant/memory/types";
import { MEMORY_KINDS } from "../../services/ai/assistant/memory/types";
import { Button } from "../ui/Button";
import { Dialog, DialogDescription, DialogTitle } from "../ui/Dialog";
import { EmptyState } from "../ui/EmptyState";
import { Select, Textarea } from "../ui/Field";
import { IconButton } from "../ui/IconButton";

export const KIND_LABELS: Record<MemoryKind, string> = {
  preference: "Preference",
  workstyle: "Work style",
  context: "Context",
  fact: "Fact"
};

type MemoryDialogProps = {
  open: boolean;
  onClose: () => void;
  loaded: boolean;
  entries: MemoryEntry[];
  onAdd: (kind: MemoryKind, text: string) => Promise<void>;
  onSaveEdit: (id: string, kind: MemoryKind, text: string) => Promise<void>;
  onTogglePin: (entry: MemoryEntry) => Promise<void>;
  onForget: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
};

export function MemoryDialog({
  open,
  onClose,
  loaded,
  entries,
  onAdd,
  onSaveEdit,
  onTogglePin,
  onForget,
  onRestore
}: MemoryDialogProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Reset transient editor state whenever the dialog is closed.
  useEffect(() => {
    if (!open) {
      setAdding(false);
      setEditingId(null);
    }
  }, [open]);

  const active = entries.filter((entry) => entry.status === "active");
  const archived = entries.filter((entry) => entry.status === "archived");

  return (
    <Dialog open={open} onClose={onClose} size="lg" className="flex max-h-[80vh] flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <DialogTitle>What the assistant has learned</DialogTitle>
          <DialogDescription className="mt-1">
            Inspect, pin, edit, or forget anything the assistant has learned about you — or add a
            memory yourself.
          </DialogDescription>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
          disabled={adding}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add memory
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {adding && (
          <MemoryForm
            saveLabel="Add"
            onCancel={() => setAdding(false)}
            onSave={async (kind, text) => {
              await onAdd(kind, text);
              setAdding(false);
            }}
          />
        )}

        {active.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {active.map((entry) =>
              editingId === entry.id ? (
                <li key={entry.id} className="p-3">
                  <MemoryForm
                    saveLabel="Save"
                    initial={entry}
                    onCancel={() => setEditingId(null)}
                    onSave={async (kind, text) => {
                      await onSaveEdit(entry.id, kind, text);
                      setEditingId(null);
                    }}
                  />
                </li>
              ) : (
                <li key={entry.id} className="group flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {KIND_LABELS[entry.kind]}
                    </span>
                    <p className="text-sm leading-relaxed text-foreground">{entry.text}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <IconButton
                      icon={Pencil}
                      label="Edit"
                      size="sm"
                      onClick={() => {
                        setAdding(false);
                        setEditingId(entry.id);
                      }}
                    />
                    <IconButton
                      icon={Pin}
                      label={entry.pinned ? "Unpin" : "Pin"}
                      size="sm"
                      className={entry.pinned ? "text-primary hover:text-primary" : undefined}
                      onClick={() => void onTogglePin(entry)}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Forget"
                      size="sm"
                      onClick={() => void onForget(entry.id)}
                    />
                  </div>
                </li>
              )
            )}
          </ul>
        ) : (
          !adding &&
          loaded && (
            <EmptyState
              icon={Brain}
              title="No memories yet"
              hint="The assistant hasn't learned anything about you yet. As you chat, durable facts about you appear here — or add one yourself."
              dashed
            />
          )
        )}

        {archived.length > 0 && (
          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Forgotten ({archived.length})
            </summary>
            <ul className="mt-2 divide-y divide-border">
              {archived.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2 opacity-60">
                  <p className="min-w-0 flex-1 text-sm text-foreground line-through">{entry.text}</p>
                  <IconButton
                    icon={RotateCcw}
                    label="Restore"
                    size="sm"
                    onClick={() => void onRestore(entry.id)}
                  />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}

type MemoryFormProps = {
  saveLabel: string;
  initial?: Pick<MemoryEntry, "kind" | "text">;
  onSave: (kind: MemoryKind, text: string) => void | Promise<void>;
  onCancel: () => void;
};

function MemoryForm({ saveLabel, initial, onSave, onCancel }: MemoryFormProps) {
  const [kind, setKind] = useState<MemoryKind>(initial?.kind ?? "preference");
  const [text, setText] = useState(initial?.text ?? "");
  const [saving, setSaving] = useState(false);
  const trimmed = text.trim();

  const handleSave = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(kind, trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-surface-2/40 p-3">
      <Select
        aria-label="Memory type"
        value={kind}
        onChange={(event) => setKind(event.target.value as MemoryKind)}
        className="h-8 w-40 text-xs"
      >
        {MEMORY_KINDS.map((value) => (
          <option key={value} value={value}>
            {KIND_LABELS[value]}
          </option>
        ))}
      </Select>
      <Textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="One durable fact about you, e.g. “Prefers deep work in the mornings.”"
        className="min-h-16 text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" loading={saving} disabled={!trimmed} onClick={() => void handleSave()}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
