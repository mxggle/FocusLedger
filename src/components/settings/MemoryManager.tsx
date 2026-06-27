import { Brain, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { assistantMemoryRepository } from "../../db/assistantMemoryRepository";
import type { MemoryEntry, MemoryKind } from "../../services/ai/assistant/memory/types";
import { createId } from "../../utils/id";
import { MemoryDialog } from "./MemoryDialog";

export function MemoryManager() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

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

  const onAdd = async (kind: MemoryKind, text: string) => {
    const ts = now();
    await assistantMemoryRepository.add({
      id: createId("mem"),
      kind,
      text,
      pinned: true, // user-authored memories are pinned so the auto-review won't clobber them
      status: "active",
      sourceMessageId: null,
      useCount: 0,
      lastUsedAt: null,
      createdAt: ts,
      updatedAt: ts
    });
    await reload();
  };
  const onSaveEdit = async (id: string, kind: MemoryKind, text: string) => {
    await assistantMemoryRepository.updateText(id, text, kind, now());
    await reload();
  };
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
  const pinnedCount = active.filter((entry) => entry.pinned).length;

  const summary = !loaded
    ? "Loading…"
    : active.length === 0
      ? "Nothing learned yet"
      : `${active.length} ${active.length === 1 ? "memory" : "memories"}${
          pinnedCount > 0 ? ` · ${pinnedCount} pinned` : ""
        }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left shadow-xs outline-none transition-[background-color,border-color,box-shadow] duration-fast hover:border-border-strong hover:bg-surface-2 focus-visible:border-ring focus-visible:shadow-ring"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Brain className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">Manage memories</span>
          <span className="block text-xs text-muted-foreground">{summary}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
      </button>

      <MemoryDialog
        open={open}
        onClose={() => setOpen(false)}
        loaded={loaded}
        entries={entries}
        onAdd={onAdd}
        onSaveEdit={onSaveEdit}
        onTogglePin={onTogglePin}
        onForget={onForget}
        onRestore={onRestore}
      />
    </>
  );
}
