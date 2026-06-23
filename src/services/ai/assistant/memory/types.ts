/** What a learned memory is about. */
export type MemoryKind = "preference" | "workstyle" | "context" | "fact";

/** One durable thing the assistant has learned about the user. */
export type MemoryEntry = {
  id: string;
  kind: MemoryKind;
  text: string; // one sentence, the learned fact
  pinned: boolean; // user-pinned: protected from auto-archive/overwrite
  status: "active" | "archived"; // archived = recoverable soft delete
  sourceMessageId: string | null; // assistant_messages.id that produced it
  useCount: number; // bumped when the model re-surfaces the same fact
  lastUsedAt: string | null; // ISO
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

/** An operation the review model proposes. Unknown/`skip` ops are dropped upstream. */
export type MemoryOp =
  | { op: "add"; kind: MemoryKind; text: string }
  | { op: "update"; id: string; text?: string; kind?: MemoryKind }
  | { op: "archive"; id: string };

/** A concrete persistence action produced by applyMemoryOps. */
export type MemoryWrite =
  | { kind: "add"; entry: MemoryEntry }
  | { kind: "updateText"; id: string; text: string; memKind: MemoryKind; updatedAt: string }
  | { kind: "archive"; id: string; updatedAt: string }
  | { kind: "bumpUsage"; id: string; useCount: number; lastUsedAt: string; updatedAt: string };

export const MEMORY_KINDS: MemoryKind[] = ["preference", "workstyle", "context", "fact"];
