import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, History, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { IconButton } from "../ui/IconButton";
import { useAssistantStore } from "../../stores/assistantStore";

/** Compact "2h ago" / "3d ago" relative time for the session list. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

export function SessionHistoryMenu() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const sessions = useAssistantStore((s) => s.sessions);
  const activeSessionId = useAssistantStore((s) => s.activeSessionId);
  const loadSessions = useAssistantStore((s) => s.loadSessions);
  const switchSession = useAssistantStore((s) => s.switchSession);
  const renameSession = useAssistantStore((s) => s.renameSession);
  const deleteSession = useAssistantStore((s) => s.deleteSession);
  const newSession = useAssistantStore((s) => s.newSession);

  // Refresh the list each time the menu opens so timestamps/order are current.
  useEffect(() => {
    if (open) void loadSessions(true);
    else setEditingId(null);
  }, [open, loadSessions]);

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  function beginRename(id: string, current: string) {
    setEditingId(id);
    setDraft(current);
  }

  function commitRename() {
    if (editingId && draft.trim().length > 0) void renameSession(editingId, draft);
    setEditingId(null);
  }

  const list = sessions ?? [];

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <IconButton icon={History} label="Conversation history" variant="ghost" size="sm" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          side="bottom"
          sideOffset={6}
          className={cn(
            "z-50 flex max-h-[60vh] w-[280px] flex-col rounded-xl border border-border bg-surface p-1.5 shadow-pop",
            "data-[state=open]:animate-scale-in data-[side=bottom]:origin-top"
          )}
        >
          <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 ? (
              <p className="px-2.5 py-3 text-sm text-muted-foreground">No past conversations yet.</p>
            ) : (
              list.map((session) => {
                const isActive = session.id === activeSessionId;
                const isEditing = session.id === editingId;
                const title = session.title.trim() || "New conversation";
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm",
                      isActive ? "bg-muted" : "hover:bg-muted"
                    )}
                  >
                    <Check
                      className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-transparent")}
                    />
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingId(null);
                          }
                        }}
                        className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-sm outline-none focus-visible:shadow-ring"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          void switchSession(session.id);
                          setOpen(false);
                        }}
                        onDoubleClick={() => beginRename(session.id, session.title)}
                        className="flex min-w-0 flex-1 flex-col items-start text-left"
                      >
                        <span className="w-full truncate text-foreground">{title}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {relativeTime(session.updatedAt)}
                        </span>
                      </button>
                    )}
                    {!isEditing ? (
                      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <IconButton
                          icon={Pencil}
                          label="Rename conversation"
                          variant="ghost"
                          size="sm"
                          onClick={() => beginRename(session.id, session.title)}
                        />
                        <IconButton
                          icon={Trash2}
                          label="Delete conversation"
                          variant="ghost"
                          size="sm"
                          onClick={() => void deleteSession(session.id)}
                        />
                      </span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => {
                newSession();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none transition-colors duration-fast hover:bg-muted"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">New chat</span>
            </button>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
