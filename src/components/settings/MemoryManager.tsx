import { Brain, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { assistantMemoryRepository } from "../../db/assistantMemoryRepository";
import type { MemoryEntry } from "../../services/ai/assistant/memory/types";
import { EmptyState } from "../ui/EmptyState";
import { IconButton } from "../ui/IconButton";

const KIND_LABELS: Record<MemoryEntry["kind"], string> = {
  preference: "Preference",
  workstyle: "Work style",
  context: "Context",
  fact: "Fact"
};

export function MemoryManager() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setEntries(await assistantMemoryRepository.getAll());
    } catch {
      setEntries([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const now = () => new Date().toISOString();

  const onForget = async (id: string) => {
    await assistantMemoryRepository.archive(id, now());
    await reload();
  };
  const onRestore = async (id: string) => {
    await assistantMemoryRepository.restore(id, now());
    await reload();
  };
  const onTogglePin = async (entry: MemoryEntry) => {
    await assistantMemoryRepository.setPinned(entry.id, !entry.pinned, now());
    await reload();
  };

  const active = entries.filter((entry) => entry.status === "active");
  const archived = entries.filter((entry) => entry.status === "archived");

  if (entries.length === 0) {
    return loaded ? (
      <EmptyState
        icon={Brain}
        title="No memories yet"
        hint="The assistant hasn't learned anything about you yet. As you chat, durable facts about you appear here."
        dashed
      />
    ) : null;
  }

  return (
    <div className="grid gap-3">
      {active.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {active.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {KIND_LABELS[entry.kind]}
                </span>
                <p className="text-sm leading-relaxed text-foreground">{entry.text}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <IconButton
                  icon={entry.pinned ? PinOff : Pin}
                  label={entry.pinned ? "Unpin" : "Pin"}
                  size="sm"
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
          ))}
        </ul>
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
  );
}
