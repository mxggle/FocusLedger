# Self-Curated Assistant Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the assistant a self-curated memory — it learns durable facts about the user from conversations (gated, debounced, cheap background LLM call), recalls the relevant ones each turn, and lets the user inspect/edit/pin/forget them.

**Architecture:** Port the memory half of the Hermes learning loop. Pure cores (`retrieve`, `reviewGate`, `reviewParser`, `applyOps`, `injectMemory`, `reviewPrompt`) + two thin impure edges (`assistantMemoryRepository`, `runMemoryReview`) + small wiring into `contextBuilder`/`systemPrompt`/`assistantStore` + a Memory viewer in Settings → AI. Pre-turn: load active memories, rank top-K in TS, inject into the prompt. Post-turn: debounced background review extracts/updates memory. Additive — no memories ⇒ prompt byte-identical to today.

**Tech Stack:** TypeScript, React 18, Zustand, Tauri SQL plugin (SQLite), Vitest. BYO-key provider layer (reuses `generateChat`; no new provider code, no embeddings, no FTS5).

**Spec:** [docs/superpowers/specs/2026-06-23-assistant-self-curated-memory-design.md](../specs/2026-06-23-assistant-self-curated-memory-design.md)

---

## File Structure

**Create:**
- `src/services/ai/assistant/memory/types.ts` — `MemoryKind`, `MemoryEntry`, `MemoryOp`, `MemoryWrite`.
- `src/services/ai/assistant/memory/retrieve.ts` — `rankMemories` + `MEMORY_INJECT_K`.
- `src/services/ai/assistant/memory/reviewGate.ts` — `shouldReview`.
- `src/services/ai/assistant/memory/reviewParser.ts` — `parseMemoryOps`.
- `src/services/ai/assistant/memory/applyOps.ts` — `applyMemoryOps`.
- `src/services/ai/assistant/memory/injectMemory.ts` — `renderMemoryBlock`.
- `src/services/ai/assistant/memory/reviewPrompt.ts` — `buildReviewPrompt`.
- `src/services/ai/assistant/memory/runMemoryReview.ts` — `runMemoryReview` (+ `MEMORY_REVIEW_DEBOUNCE_MS`).
- `src/db/assistantMemoryRepository.ts` — CRUD repository.
- `src/components/settings/MemoryManager.tsx` — the Memory viewer.
- Plus a `*.test.ts(x)` beside each non-trivial file above.

**Modify:**
- `src/db/migrations.ts` — add `assistant_memory` table + index to `SCHEMA_STATEMENTS`.
- `src/types/settings.ts` — add `assistantMemoryEnabled`, `assistantMemoryModel`.
- `src/services/ai/assistant/types.ts` — `AssistantContext.learnedMemories?`.
- `src/services/ai/assistant/contextBuilder.ts` — pass `learnedMemories` through.
- `src/services/ai/assistant/systemPrompt.ts` — render the learned-memory block.
- `src/stores/assistantStore.ts` — pre-turn load+rank, post-turn debounced review.
- `src/components/settings/SettingsPage.tsx` — mount `MemoryManager` in the AI section.
- `docs/ai-architecture.md` — document the memory subsystem.

---

## Task 1: Memory types + schema migration

**Files:**
- Create: `src/services/ai/assistant/memory/types.ts`
- Modify: `src/db/migrations.ts:91-98` (add table + index inside `SCHEMA_STATEMENTS`)

- [ ] **Step 1: Create the types module** (no test — type-only)

```typescript
// src/services/ai/assistant/memory/types.ts

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
```

- [ ] **Step 2: Add the schema** — in `src/db/migrations.ts`, immediately after the `assistant_messages` index line (`...idx_assistant_messages_created...`, line 98), insert two entries into the `SCHEMA_STATEMENTS` array:

```typescript
  `CREATE TABLE IF NOT EXISTS assistant_memory (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    source_message_id TEXT,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_memory_status ON assistant_memory(status)`,
```

- [ ] **Step 3: Verify it compiles**

Run: `yarn build`
Expected: PASS (tsc + vite succeed).

- [ ] **Step 4: Commit**

```bash
git add src/services/ai/assistant/memory/types.ts src/db/migrations.ts
git commit -m "feat(memory): add MemoryEntry types and assistant_memory schema"
```

---

## Task 2: `retrieve.ts` — pure top-K ranking

**Files:**
- Create: `src/services/ai/assistant/memory/retrieve.ts`
- Test: `src/services/ai/assistant/memory/retrieve.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/assistant/memory/retrieve.test.ts
import { describe, expect, it } from "vitest";
import { rankMemories, MEMORY_INJECT_K } from "./retrieve";
import type { MemoryEntry } from "./types";

function mem(partial: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kind: "fact",
    pinned: false,
    status: "active",
    sourceMessageId: null,
    useCount: 0,
    lastUsedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial
  };
}

describe("rankMemories", () => {
  it("ranks keyword-overlapping memories first", () => {
    const all = [
      mem({ id: "a", text: "Prefers deep work in the morning" }),
      mem({ id: "b", text: "Likes spicy food" })
    ];
    const ranked = rankMemories(all, "plan my morning work block", 5);
    expect(ranked[0].id).toBe("a");
  });

  it("caps results at k", () => {
    const all = Array.from({ length: 20 }, (_, i) => mem({ id: `m${i}`, text: `task ${i} planning` }));
    expect(rankMemories(all, "planning", 5)).toHaveLength(5);
  });

  it("always includes pinned entries even with no keyword match", () => {
    const all = [
      mem({ id: "pin", text: "Address me as Captain", pinned: true }),
      mem({ id: "x", text: "Uses VS Code" })
    ];
    const ranked = rankMemories(all, "unrelated query about lunch", 5);
    expect(ranked.map((m) => m.id)).toContain("pin");
  });

  it("returns an empty array for no entries", () => {
    expect(rankMemories([], "anything", 5)).toEqual([]);
  });

  it("exports a sensible default K", () => {
    expect(MEMORY_INJECT_K).toBe(8);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`yarn test src/services/ai/assistant/memory/retrieve.test.ts`) with "rankMemories is not a function".

- [ ] **Step 3: Implement**

```typescript
// src/services/ai/assistant/memory/retrieve.ts
import type { MemoryEntry } from "./types";

/** How many memories to inject into a turn's prompt. */
export const MEMORY_INJECT_K = 8;

function keywordScore(text: string, terms: string[]): number {
  const hay = text.toLowerCase();
  return terms.reduce((acc, term) => (term.length > 2 && hay.includes(term) ? acc + 1 : acc), 0);
}

/**
 * Rank active memories for the current user message, purely in TS (mirrors the
 * `tools.ts` keyword scan). Score = keyword overlap + pinned boost + usage boost
 * + slight recency. Pinned entries are always eligible. Returns ≤ k entries.
 */
export function rankMemories(all: MemoryEntry[], query: string, k: number): MemoryEntry[] {
  if (all.length === 0) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = all.map((entry) => {
    let score = keywordScore(entry.text, terms);
    if (entry.pinned) score += 100; // pinned always surfaces
    score += Math.min(entry.useCount, 5) * 0.5;
    score += entry.updatedAt > "2026" ? 0.1 : 0; // negligible recency nudge
    return { entry, score };
  });
  return scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((row) => row.entry);
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/memory/retrieve.ts src/services/ai/assistant/memory/retrieve.test.ts
git commit -m "feat(memory): pure top-K memory ranking"
```

---

## Task 3: `reviewGate.ts` — pure cost guard

**Files:**
- Create: `src/services/ai/assistant/memory/reviewGate.ts`
- Test: `src/services/ai/assistant/memory/reviewGate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/assistant/memory/reviewGate.test.ts
import { describe, expect, it } from "vitest";
import { shouldReview } from "./reviewGate";

describe("shouldReview", () => {
  it("skips trivial acknowledgements", () => {
    expect(shouldReview("thanks!", "You're welcome.")).toBe(false);
    expect(shouldReview("ok", "Done.")).toBe(false);
    expect(shouldReview("👍", "")).toBe(false);
  });

  it("reviews substantive user turns", () => {
    expect(shouldReview("I always batch admin work on Fridays", "Noted.")).toBe(true);
  });

  it("reviews corrections/preferences even when short", () => {
    expect(shouldReview("stop padding my estimates", "Okay.")).toBe(true);
    expect(shouldReview("remember I hate meetings before 10am", "Got it.")).toBe(true);
  });

  it("skips when user text is empty", () => {
    expect(shouldReview("   ", "anything")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/services/ai/assistant/memory/reviewGate.ts

const TRIVIAL = new Set([
  "ok", "okay", "k", "kk", "thanks", "thank you", "thx", "ty", "great",
  "cool", "nice", "yes", "no", "yep", "nope", "sure", "done", "got it"
]);

/** Strong signals that a turn carries something worth remembering. */
const SIGNAL = /\b(always|never|prefer|i like|i hate|i don'?t like|remember|my|i'?m|i am|usually|tend to|stop|don'?t|please|call me|work|focus|goal|deadline)\b/i;

/**
 * Cheap, conservative gate deciding whether to spend an aux LLM call reviewing
 * this exchange for memory. Skip trivial acks; fire on substantive or
 * preference/correction-bearing turns. Pure.
 */
export function shouldReview(userText: string, _assistantText: string): boolean {
  const text = userText.trim();
  if (text.length === 0) return false;
  const normalized = text.toLowerCase().replace(/[!.?,\s]+$/g, "");
  if (TRIVIAL.has(normalized)) return false;
  if (SIGNAL.test(text)) return true;
  // Otherwise only bother with turns long enough to plausibly carry signal.
  return text.split(/\s+/).length >= 6;
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/memory/reviewGate.ts src/services/ai/assistant/memory/reviewGate.test.ts
git commit -m "feat(memory): pure review gate (cost guard)"
```

---

## Task 4: `reviewParser.ts` — parse model output to ops

**Files:**
- Create: `src/services/ai/assistant/memory/reviewParser.ts`
- Test: `src/services/ai/assistant/memory/reviewParser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/assistant/memory/reviewParser.test.ts
import { describe, expect, it } from "vitest";
import { parseMemoryOps } from "./reviewParser";

describe("parseMemoryOps", () => {
  it("parses a clean array of ops", () => {
    const raw = JSON.stringify([
      { op: "add", kind: "preference", text: "Prefers mornings" },
      { op: "archive", id: "m1" }
    ]);
    expect(parseMemoryOps(raw)).toEqual([
      { op: "add", kind: "preference", text: "Prefers mornings" },
      { op: "archive", id: "m1" }
    ]);
  });

  it("tolerates a fenced code block and surrounding prose", () => {
    const raw = "Sure!\n```json\n[{\"op\":\"add\",\"kind\":\"fact\",\"text\":\"Lives in Tokyo\"}]\n```";
    expect(parseMemoryOps(raw)).toEqual([{ op: "add", kind: "fact", text: "Lives in Tokyo" }]);
  });

  it("drops invalid ops but keeps valid ones", () => {
    const raw = JSON.stringify([
      { op: "add", kind: "bogus", text: "x" }, // bad kind
      { op: "add", kind: "context", text: "" }, // empty text
      { op: "update", text: "no id" }, // missing id
      { op: "skip" }, // no-op
      { op: "add", kind: "context", text: "Q3 launch is the priority" } // valid
    ]);
    expect(parseMemoryOps(raw)).toEqual([{ op: "add", kind: "context", text: "Q3 launch is the priority" }]);
  });

  it("returns [] for non-array / unparseable output", () => {
    expect(parseMemoryOps("Nothing to save.")).toEqual([]);
    expect(parseMemoryOps("{}")).toEqual([]);
    expect(parseMemoryOps("")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/services/ai/assistant/memory/reviewParser.ts
import { MEMORY_KINDS, type MemoryKind, type MemoryOp } from "./types";

/** Pull the outermost JSON array out of a model reply, tolerating fences/prose. */
function extractJsonArray(raw: string): string | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function isKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && (MEMORY_KINDS as string[]).includes(value);
}

function toOp(entry: unknown): MemoryOp | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  if (record.op === "add" && isKind(record.kind) && typeof record.text === "string" && record.text.trim()) {
    return { op: "add", kind: record.kind, text: record.text.trim() };
  }
  if (record.op === "update" && typeof record.id === "string" && record.id) {
    const op: MemoryOp = { op: "update", id: record.id };
    if (typeof record.text === "string" && record.text.trim()) op.text = record.text.trim();
    if (isKind(record.kind)) op.kind = record.kind;
    return op.text || op.kind ? op : null;
  }
  if (record.op === "archive" && typeof record.id === "string" && record.id) {
    return { op: "archive", id: record.id };
  }
  return null; // unknown op / "skip" / malformed → dropped
}

/** Parse the review model's output into validated ops. Never throws; drops invalid. */
export function parseMemoryOps(raw: string): MemoryOp[] {
  const candidate = extractJsonArray(raw);
  if (!candidate) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(toOp).filter((op): op is MemoryOp => op !== null);
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/memory/reviewParser.ts src/services/ai/assistant/memory/reviewParser.test.ts
git commit -m "feat(memory): parse review output into validated ops"
```

---

## Task 5: `applyOps.ts` — pure dedup / merge / archive

**Files:**
- Create: `src/services/ai/assistant/memory/applyOps.ts`
- Test: `src/services/ai/assistant/memory/applyOps.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/assistant/memory/applyOps.test.ts
import { describe, expect, it } from "vitest";
import { applyMemoryOps } from "./applyOps";
import type { MemoryEntry } from "./types";

function mem(partial: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kind: "fact", pinned: false, status: "active", sourceMessageId: null,
    useCount: 0, lastUsedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial
  };
}

const NOW = "2026-06-23T12:00:00.000Z";
let counter = 0;
const makeId = () => `gen${counter++}`;

describe("applyMemoryOps", () => {
  it("adds a brand-new fact", () => {
    counter = 0;
    const { writes } = applyMemoryOps([], [{ op: "add", kind: "preference", text: "Prefers mornings" }], NOW, makeId);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ kind: "add" });
    expect(writes[0]).toHaveProperty("entry.text", "Prefers mornings");
  });

  it("collapses a near-duplicate add into a usage bump", () => {
    const existing = [mem({ id: "m1", text: "Prefers mornings", useCount: 1 })];
    const { writes } = applyMemoryOps(existing, [{ op: "add", kind: "preference", text: "  prefers MORNINGS " }], NOW, makeId);
    expect(writes).toEqual([{ kind: "bumpUsage", id: "m1", useCount: 2, lastUsedAt: NOW, updatedAt: NOW }]);
  });

  it("updates text on an existing unpinned entry", () => {
    const existing = [mem({ id: "m1", text: "Old" })];
    const { writes } = applyMemoryOps(existing, [{ op: "update", id: "m1", text: "New", kind: "context" }], NOW, makeId);
    expect(writes).toEqual([{ kind: "updateText", id: "m1", text: "New", memKind: "context", updatedAt: NOW }]);
  });

  it("archives an existing unpinned entry", () => {
    const existing = [mem({ id: "m1", text: "stale" })];
    const { writes } = applyMemoryOps(existing, [{ op: "archive", id: "m1" }], NOW, makeId);
    expect(writes).toEqual([{ kind: "archive", id: "m1", updatedAt: NOW }]);
  });

  it("protects pinned entries from update and archive", () => {
    const existing = [mem({ id: "p", text: "Call me Captain", pinned: true })];
    const { writes } = applyMemoryOps(
      existing,
      [{ op: "update", id: "p", text: "Call me Skipper" }, { op: "archive", id: "p" }],
      NOW, makeId
    );
    expect(writes).toEqual([]);
  });

  it("drops update/archive for unknown ids", () => {
    const { writes } = applyMemoryOps([], [{ op: "archive", id: "ghost" }], NOW, makeId);
    expect(writes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/services/ai/assistant/memory/applyOps.ts
import type { MemoryEntry, MemoryOp, MemoryWrite } from "./types";

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Fold the review model's ops into concrete persistence writes, deterministically.
 * Invariants: near-duplicate adds become usage bumps (never duplicate rows);
 * pinned entries are protected from update/archive; nothing is hard-deleted
 * (archive only); unknown-id ops are dropped. Pure — `now`/`makeId` injected.
 */
export function applyMemoryOps(
  existing: MemoryEntry[],
  ops: MemoryOp[],
  now: string,
  makeId: () => string
): { writes: MemoryWrite[] } {
  const writes: MemoryWrite[] = [];
  const byId = new Map(existing.map((e) => [e.id, e]));
  const byText = new Map(existing.map((e) => [normalize(e.text), e]));

  for (const op of ops) {
    if (op.op === "add") {
      const dup = byText.get(normalize(op.text));
      if (dup) {
        writes.push({ kind: "bumpUsage", id: dup.id, useCount: dup.useCount + 1, lastUsedAt: now, updatedAt: now });
        continue;
      }
      const entry: MemoryEntry = {
        id: makeId(), kind: op.kind, text: op.text, pinned: false, status: "active",
        sourceMessageId: null, useCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now
      };
      writes.push({ kind: "add", entry });
      byText.set(normalize(op.text), entry);
      continue;
    }
    const target = byId.get(op.id);
    if (!target || target.pinned) continue; // unknown or protected → drop
    if (op.op === "update") {
      writes.push({ kind: "updateText", id: target.id, text: op.text ?? target.text, memKind: op.kind ?? target.kind, updatedAt: now });
    } else {
      writes.push({ kind: "archive", id: target.id, updatedAt: now });
    }
  }
  return { writes };
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/memory/applyOps.ts src/services/ai/assistant/memory/applyOps.test.ts
git commit -m "feat(memory): pure op-folding with dedup, merge, archive, pin-protection"
```

---

## Task 6: `injectMemory.ts` — pure prompt block

**Files:**
- Create: `src/services/ai/assistant/memory/injectMemory.ts`
- Test: `src/services/ai/assistant/memory/injectMemory.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/assistant/memory/injectMemory.test.ts
import { describe, expect, it } from "vitest";
import { renderMemoryBlock } from "./injectMemory";
import type { MemoryEntry } from "./types";

function mem(partial: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kind: "fact", pinned: false, status: "active", sourceMessageId: null,
    useCount: 0, lastUsedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial
  };
}

describe("renderMemoryBlock", () => {
  it("returns empty string when there are no memories (additive guarantee)", () => {
    expect(renderMemoryBlock([])).toBe("");
  });

  it("renders a labelled block listing each memory", () => {
    const block = renderMemoryBlock([
      mem({ id: "a", kind: "preference", text: "Prefers mornings" }),
      mem({ id: "b", kind: "context", text: "Q3 launch is priority" })
    ]);
    expect(block).toContain("learned about the user");
    expect(block).toContain("Prefers mornings");
    expect(block).toContain("Q3 launch is priority");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/services/ai/assistant/memory/injectMemory.ts
import type { MemoryEntry } from "./types";

/**
 * Render ranked memories into a system-prompt block. Empty in ⇒ empty out, so
 * the prompt is byte-identical to today when there is nothing learned yet.
 */
export function renderMemoryBlock(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map((entry) => `- (${entry.kind}) ${entry.text}`);
  return [
    "What you've learned about the user over time (use it to tailor proposals, estimates, and tone; refine it as you learn more — do not repeat it back verbatim):",
    ...lines
  ].join("\n");
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/memory/injectMemory.ts src/services/ai/assistant/memory/injectMemory.test.ts
git commit -m "feat(memory): render learned-memory prompt block (additive)"
```

---

## Task 7: `reviewPrompt.ts` — build the background-review prompt

**Files:**
- Create: `src/services/ai/assistant/memory/reviewPrompt.ts`
- Test: `src/services/ai/assistant/memory/reviewPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/assistant/memory/reviewPrompt.test.ts
import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "./reviewPrompt";
import type { MemoryEntry } from "./types";

function mem(partial: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kind: "fact", pinned: false, status: "active", sourceMessageId: null,
    useCount: 0, lastUsedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial
  };
}

describe("buildReviewPrompt", () => {
  it("instructs JSON-array output and includes the exchange", () => {
    const { system, messages } = buildReviewPrompt(
      { userText: "I batch admin on Fridays", assistantText: "Noted." },
      []
    );
    expect(system).toMatch(/JSON array/i);
    expect(system).toMatch(/preference|work style|persona/i);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("I batch admin on Fridays");
    expect(messages[0].content).toContain("Noted.");
  });

  it("lists existing memories with ids so the model can dedup/update/archive", () => {
    const { messages } = buildReviewPrompt(
      { userText: "actually I prefer afternoons now", assistantText: "Updated." },
      [mem({ id: "m1", kind: "preference", text: "Prefers mornings" })]
    );
    expect(messages[0].content).toContain("m1");
    expect(messages[0].content).toContain("Prefers mornings");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/services/ai/assistant/memory/reviewPrompt.ts
import type { ChatTurn } from "../../providers";
import type { MemoryEntry } from "./types";

const SYSTEM = [
  "You maintain a long-term memory of the user for a personal productivity assistant.",
  "Review the latest exchange and decide what, if anything, is worth remembering long-term.",
  "Focus on durable facts about the user: their persona and personal details, their",
  "preferences, their work style, recurring context (projects, goals, deadlines), and",
  "expectations about how the assistant should behave. Ignore one-off task details.",
  "",
  "Reply with ONLY a JSON array of operations (no prose). Each item is one of:",
  '  { "op": "add", "kind": "preference|workstyle|context|fact", "text": "<one sentence>" }',
  '  { "op": "update", "id": "<existing id>", "text": "<new sentence>" }',
  '  { "op": "archive", "id": "<existing id>" }   // when a fact is now wrong/outdated',
  "Rules: add only genuinely new, durable facts; if it duplicates an existing memory, omit it;",
  "if it contradicts an existing memory, update or archive that one by id; keep each text to a",
  "single concise sentence in third person. If nothing is worth saving, reply with []."
].join("\n");

function renderExisting(existing: MemoryEntry[]): string {
  if (existing.length === 0) return "Existing memories: none.";
  const lines = existing.map((e) => `- [${e.id}] (${e.kind}) ${e.text}`);
  return ["Existing memories (dedup/update/archive against these):", ...lines].join("\n");
}

/** Build the system + single user message for the background review aux call. */
export function buildReviewPrompt(
  exchange: { userText: string; assistantText: string },
  existing: MemoryEntry[]
): { system: string; messages: ChatTurn[] } {
  const content = [
    renderExisting(existing),
    "",
    "Latest exchange:",
    `User: ${exchange.userText}`,
    `Assistant: ${exchange.assistantText}`,
    "",
    "Return the JSON array of memory operations now."
  ].join("\n");
  return { system: SYSTEM, messages: [{ role: "user", content }] };
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/memory/reviewPrompt.ts src/services/ai/assistant/memory/reviewPrompt.test.ts
git commit -m "feat(memory): background-review prompt builder"
```

---

## Task 8: `assistantMemoryRepository.ts` — persistence edge

**Files:**
- Create: `src/db/assistantMemoryRepository.ts`
- Test: `src/db/assistantMemoryRepository.test.ts`

- [ ] **Step 1: Write the failing test** (mirrors `assistantMessageRepository.test.ts` mock style)

```typescript
// src/db/assistantMemoryRepository.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryEntry } from "../services/ai/assistant/memory/types";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn() }));
vi.mock("./client", () => ({
  getDatabase: vi.fn(async () => ({ execute: mocks.execute, select: mocks.select }))
}));

import { assistantMemoryRepository } from "./assistantMemoryRepository";

function entry(): MemoryEntry {
  return {
    id: "m1", kind: "preference", text: "Prefers mornings", pinned: false, status: "active",
    sourceMessageId: null, useCount: 0, lastUsedAt: null,
    createdAt: "2026-06-23T00:00:00.000Z", updatedAt: "2026-06-23T00:00:00.000Z"
  };
}

describe("assistantMemoryRepository", () => {
  beforeEach(() => { mocks.execute.mockReset(); mocks.select.mockReset(); });

  it("getActive selects active rows and maps pinned to boolean", async () => {
    mocks.select.mockResolvedValue([
      { id: "m1", kind: "preference", text: "x", pinned: 1, status: "active",
        source_message_id: null, use_count: 2, last_used_at: null,
        created_at: "2026-06-23T00:00:00.000Z", updated_at: "2026-06-23T00:00:00.000Z" }
    ]);
    const result = await assistantMemoryRepository.getActive();
    expect(mocks.select.mock.calls[0][0]).toContain("WHERE status = 'active'");
    expect(result[0].pinned).toBe(true);
    expect(result[0].useCount).toBe(2);
  });

  it("add inserts all columns", async () => {
    await assistantMemoryRepository.add(entry());
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO assistant_memory");
    expect(params[0]).toBe("m1");
    expect(params[3]).toBe(0); // pinned false → 0
  });

  it("archive flips status", async () => {
    await assistantMemoryRepository.archive("m1", "2026-06-23T01:00:00.000Z");
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain("UPDATE assistant_memory SET status = 'archived'");
    expect(params).toEqual(["2026-06-23T01:00:00.000Z", "m1"]);
  });

  it("setPinned writes the integer flag", async () => {
    await assistantMemoryRepository.setPinned("m1", true, "2026-06-23T01:00:00.000Z");
    expect(mocks.execute.mock.calls[0][1]).toEqual([1, "2026-06-23T01:00:00.000Z", "m1"]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/db/assistantMemoryRepository.ts
import { getDatabase } from "./client";
import type { MemoryEntry, MemoryKind } from "../services/ai/assistant/memory/types";

type MemoryRow = {
  id: string; kind: string; text: string; pinned: number; status: string;
  source_message_id: string | null; use_count: number; last_used_at: string | null;
  created_at: string; updated_at: string;
};

function toEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id, kind: row.kind as MemoryKind, text: row.text, pinned: row.pinned === 1,
    status: row.status === "archived" ? "archived" : "active",
    sourceMessageId: row.source_message_id, useCount: row.use_count, lastUsedAt: row.last_used_at,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export const assistantMemoryRepository = {
  async getActive(): Promise<MemoryEntry[]> {
    const db = await getDatabase();
    const rows = await db.select<MemoryRow[]>(
      "SELECT * FROM assistant_memory WHERE status = 'active' ORDER BY updated_at DESC"
    );
    return rows.map(toEntry);
  },

  async getAll(): Promise<MemoryEntry[]> {
    const db = await getDatabase();
    const rows = await db.select<MemoryRow[]>("SELECT * FROM assistant_memory ORDER BY updated_at DESC");
    return rows.map(toEntry);
  },

  async add(entry: MemoryEntry): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO assistant_memory
         (id, kind, text, pinned, status, source_message_id, use_count, last_used_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [entry.id, entry.kind, entry.text, entry.pinned ? 1 : 0, entry.status, entry.sourceMessageId,
       entry.useCount, entry.lastUsedAt, entry.createdAt, entry.updatedAt]
    );
  },

  async updateText(id: string, text: string, kind: MemoryKind, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_memory SET text = $1, kind = $2, updated_at = $3 WHERE id = $4",
      [text, kind, updatedAt, id]
    );
  },

  async bumpUsage(id: string, useCount: number, lastUsedAt: string, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_memory SET use_count = $1, last_used_at = $2, updated_at = $3 WHERE id = $4",
      [useCount, lastUsedAt, updatedAt, id]
    );
  },

  async archive(id: string, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_memory SET status = 'archived', updated_at = $1 WHERE id = $2",
      [updatedAt, id]
    );
  },

  async restore(id: string, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_memory SET status = 'active', updated_at = $1 WHERE id = $2",
      [updatedAt, id]
    );
  },

  async setPinned(id: string, pinned: boolean, updatedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE assistant_memory SET pinned = $1, updated_at = $2 WHERE id = $3",
      [pinned ? 1 : 0, updatedAt, id]
    );
  }
};
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/db/assistantMemoryRepository.ts src/db/assistantMemoryRepository.test.ts
git commit -m "feat(memory): assistant_memory repository (CRUD + archive/restore/pin)"
```

---

## Task 9: `runMemoryReview.ts` — orchestrator edge

**Files:**
- Create: `src/services/ai/assistant/memory/runMemoryReview.ts`
- Test: `src/services/ai/assistant/memory/runMemoryReview.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/assistant/memory/runMemoryReview.test.ts
import { describe, expect, it, vi } from "vitest";
import { runMemoryReview } from "./runMemoryReview";
import type { MemoryEntry } from "./types";
import type { AiSettings } from "../../providers";

const settings = { aiProvider: "anthropic", aiApiKey: "k", aiModel: "m", aiBaseUrl: "" } as unknown as AiSettings;

function deps(generateChat: ReturnType<typeof vi.fn>) {
  return {
    generateChat,
    repo: {
      add: vi.fn(async () => {}), updateText: vi.fn(async () => {}),
      bumpUsage: vi.fn(async () => {}), archive: vi.fn(async () => {})
    },
    makeId: () => "gen1",
    now: () => "2026-06-23T12:00:00.000Z"
  };
}

describe("runMemoryReview", () => {
  it("short-circuits trivial turns without calling the model", async () => {
    const generateChat = vi.fn();
    const d = deps(generateChat);
    await runMemoryReview({ settings, userText: "thanks", assistantText: "np", existing: [] }, d);
    expect(generateChat).not.toHaveBeenCalled();
    expect(d.repo.add).not.toHaveBeenCalled();
  });

  it("persists an added memory on a substantive turn", async () => {
    const generateChat = vi.fn(async () => '[{"op":"add","kind":"preference","text":"Prefers mornings"}]');
    const d = deps(generateChat);
    await runMemoryReview(
      { settings, userText: "I always work best in the mornings", assistantText: "Noted.", existing: [] },
      d
    );
    expect(generateChat).toHaveBeenCalledOnce();
    expect(d.repo.add).toHaveBeenCalledOnce();
    expect(d.repo.add.mock.calls[0][0]).toMatchObject({ text: "Prefers mornings", id: "gen1" });
  });

  it("swallows model errors without throwing", async () => {
    const generateChat = vi.fn(async () => { throw new Error("network"); });
    const d = deps(generateChat);
    await expect(
      runMemoryReview({ settings, userText: "I prefer afternoons always", assistantText: "ok", existing: [] }, d)
    ).resolves.toBeUndefined();
    expect(d.repo.add).not.toHaveBeenCalled();
  });

  it("routes an archive op to repo.archive", async () => {
    const generateChat = vi.fn(async () => '[{"op":"archive","id":"m1"}]');
    const d = deps(generateChat);
    const existing: MemoryEntry[] = [{
      id: "m1", kind: "fact", text: "old", pinned: false, status: "active", sourceMessageId: null,
      useCount: 0, lastUsedAt: null, createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z"
    }];
    await runMemoryReview({ settings, userText: "that is no longer true, please forget it", assistantText: "ok", existing }, d);
    expect(d.repo.archive).toHaveBeenCalledWith("m1", "2026-06-23T12:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/services/ai/assistant/memory/runMemoryReview.ts
import { generateChat as defaultGenerateChat } from "../../chatClient";
import type { AiSettings, ChatInput } from "../../providers";
import { assistantMemoryRepository } from "../../../../db/assistantMemoryRepository";
import { createId } from "../../../../utils/id";
import { applyMemoryOps } from "./applyOps";
import { buildReviewPrompt } from "./reviewPrompt";
import { parseMemoryOps } from "./reviewParser";
import { shouldReview } from "./reviewGate";
import type { MemoryEntry } from "./types";

/** Coalesce rapid back-and-forth into one review. */
export const MEMORY_REVIEW_DEBOUNCE_MS = 1500;

export type RunMemoryReviewInput = {
  settings: AiSettings; // aiModel already overridden to the aux model by the caller
  userText: string;
  assistantText: string;
  existing: MemoryEntry[];
};

export type MemoryRepo = Pick<
  typeof assistantMemoryRepository,
  "add" | "updateText" | "bumpUsage" | "archive"
>;

export type MemoryReviewDeps = {
  generateChat: (settings: AiSettings, input: ChatInput) => Promise<string>;
  repo: MemoryRepo;
  makeId: () => string;
  now: () => string;
};

const defaultDeps: MemoryReviewDeps = {
  generateChat: defaultGenerateChat,
  repo: assistantMemoryRepository,
  makeId: () => createId("mem"),
  now: () => new Date().toISOString()
};

/**
 * Background memory review (ports Hermes background_review, memory half): gate →
 * prompt → one aux LLM call → parse → fold → persist. Fire-and-forget: never
 * throws, never blocks a turn. Returns when done (or skipped).
 */
export async function runMemoryReview(
  input: RunMemoryReviewInput,
  deps: MemoryReviewDeps = defaultDeps
): Promise<void> {
  if (!shouldReview(input.userText, input.assistantText)) return;

  const { system, messages } = buildReviewPrompt(
    { userText: input.userText, assistantText: input.assistantText },
    input.existing
  );

  let raw: string;
  try {
    raw = await deps.generateChat(input.settings, { system, messages, temperature: 0 });
  } catch {
    return; // network/provider error — leave memory untouched
  }

  const ops = parseMemoryOps(raw);
  if (ops.length === 0) return;

  const { writes } = applyMemoryOps(input.existing, ops, deps.now(), deps.makeId);
  for (const write of writes) {
    try {
      if (write.kind === "add") await deps.repo.add(write.entry);
      else if (write.kind === "updateText") await deps.repo.updateText(write.id, write.text, write.memKind, write.updatedAt);
      else if (write.kind === "bumpUsage") await deps.repo.bumpUsage(write.id, write.useCount, write.lastUsedAt, write.updatedAt);
      else await deps.repo.archive(write.id, write.updatedAt);
    } catch {
      // one failed write must not sink the rest
    }
  }
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/memory/runMemoryReview.ts src/services/ai/assistant/memory/runMemoryReview.test.ts
git commit -m "feat(memory): background review orchestrator (gate→prompt→parse→apply→persist)"
```

---

## Task 10: Settings keys

**Files:**
- Modify: `src/types/settings.ts:42` (add to `AppSettings`) and `:64` (add to `DEFAULT_SETTINGS`)

- [ ] **Step 1: Add the fields** — in `AppSettings`, after `assistantSoul`:

```typescript
  /** Master switch for self-curated memory (background review + recall). */
  assistantMemoryEnabled: boolean;
  /** Optional cheaper model for the background memory review; empty → reuse aiModel. */
  assistantMemoryModel: string;
```

- [ ] **Step 2: Add the defaults** — in `DEFAULT_SETTINGS`, after `assistantSoul: ""`:

```typescript
  assistantMemoryEnabled: true,
  assistantMemoryModel: "",
```

- [ ] **Step 3: Verify it compiles**

Run: `yarn build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/types/settings.ts
git commit -m "feat(memory): add memory settings (enabled + aux model)"
```

---

## Task 11: Wire memory into context + system prompt

**Files:**
- Modify: `src/services/ai/assistant/types.ts` (`AssistantContext`)
- Modify: `src/services/ai/assistant/contextBuilder.ts` (snapshot + builder)
- Modify: `src/services/ai/assistant/systemPrompt.ts` (render block)
- Test: extend `src/services/ai/assistant/systemPrompt.test.ts`

- [ ] **Step 1: Write the failing test** — append to `systemPrompt.test.ts`:

```typescript
import { renderMemoryBlock } from "./memory/injectMemory"; // (top of file with other imports)

describe("learned memory block", () => {
  it("includes learned memories when present", () => {
    const base = makeCtx(); // existing test helper that builds a minimal AssistantContext
    const ctx = {
      ...base,
      learnedMemories: [
        { id: "a", kind: "preference" as const, text: "Prefers mornings", pinned: false,
          status: "active" as const, sourceMessageId: null, useCount: 0, lastUsedAt: null,
          createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z" }
      ]
    };
    const prompt = buildAssistantSystemPrompt(ctx);
    expect(prompt).toContain("Prefers mornings");
  });

  it("omits the block when there are no learned memories (byte-identical)", () => {
    const ctx = makeCtx();
    expect(buildAssistantSystemPrompt(ctx)).not.toContain("learned about the user over time");
  });
});
```

> If `systemPrompt.test.ts` has no `makeCtx` helper, reuse the existing context-construction pattern already used by that file's other tests.

- [ ] **Step 2: Run it — expect FAIL** (TS error: `learnedMemories` not on `AssistantContext`).

- [ ] **Step 3a: Extend `AssistantContext`** — in `src/services/ai/assistant/types.ts`, add the import and field:

```typescript
import type { MemoryEntry } from "./memory/types";
// ...inside AssistantContext, after `retro?: RetrospectiveInsights;`:
  learnedMemories?: MemoryEntry[]; // ranked top-K for this turn (empty/absent → no block)
```

- [ ] **Step 3b: Pass it through `contextBuilder.ts`** — add `learnedMemories?: MemoryEntry[]` to `AssistantStoreSnapshot`, import the type, and in the returned object add (after the `retro` spread):

```typescript
    ...(snapshot.learnedMemories && snapshot.learnedMemories.length > 0
      ? { learnedMemories: snapshot.learnedMemories }
      : {})
```

(Top of file: `import type { MemoryEntry } from "./memory/types";`.)

- [ ] **Step 3c: Render in `systemPrompt.ts`** — add the import and emit the block right after the existing `profile` section (inside `buildAssistantSystemPrompt`, the `lines` array):

```typescript
import { renderMemoryBlock } from "./memory/injectMemory";
// ...after the `...(ctx.profile ? [...] : [])` spread in the `lines` array:
    ...(ctx.learnedMemories && ctx.learnedMemories.length > 0
      ? [renderMemoryBlock(ctx.learnedMemories), ""]
      : []),
```

- [ ] **Step 4: Run tests — expect PASS** (`yarn test src/services/ai/assistant/systemPrompt.test.ts` and `yarn build`).

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/types.ts src/services/ai/assistant/contextBuilder.ts src/services/ai/assistant/systemPrompt.ts src/services/ai/assistant/systemPrompt.test.ts
git commit -m "feat(memory): inject learned-memory block into the system prompt"
```

---

## Task 12: Wire memory into `assistantStore`

**Files:**
- Modify: `src/stores/assistantStore.ts`
- Test: extend `src/stores/assistantStore.test.ts`

- [ ] **Step 1: Write the failing test** — add to `assistantStore.test.ts` (mock the repo + the review module):

```typescript
vi.mock("../db/assistantMemoryRepository", () => ({
  assistantMemoryRepository: {
    getActive: vi.fn(async () => []),
    getAll: vi.fn(async () => [])
  }
}));
const reviewMock = vi.hoisted(() => ({ runMemoryReview: vi.fn(async () => {}) }));
vi.mock("../services/ai/assistant/memory/runMemoryReview", () => ({
  runMemoryReview: reviewMock.runMemoryReview,
  MEMORY_REVIEW_DEBOUNCE_MS: 0
}));

it("loadMemories caches active memories for the session", async () => {
  const { assistantMemoryRepository } = await import("../db/assistantMemoryRepository");
  await useAssistantStore.getState().loadMemories();
  expect(assistantMemoryRepository.getActive).toHaveBeenCalledOnce();
  await useAssistantStore.getState().loadMemories();
  expect(assistantMemoryRepository.getActive).toHaveBeenCalledOnce(); // cached, not re-fetched
});
```

> Match the existing `assistantStore.test.ts` setup (it already mocks the runner, taskStore, settingsStore, and `assistantMessageRepository`). Add the two mocks above alongside those.

- [ ] **Step 2: Run it — expect FAIL** (`loadMemories` not defined).

- [ ] **Step 3a: Imports** — add near the top of `assistantStore.ts`:

```typescript
import { assistantMemoryRepository } from "../db/assistantMemoryRepository";
import { rankMemories, MEMORY_INJECT_K } from "../services/ai/assistant/memory/retrieve";
import { runMemoryReview, MEMORY_REVIEW_DEBOUNCE_MS } from "../services/ai/assistant/memory/runMemoryReview";
import type { MemoryEntry } from "../services/ai/assistant/memory/types";
```

- [ ] **Step 3b: State + action type** — add `memories: MemoryEntry[] | null;` to the state object literal (initial value `memories: null,`) and `loadMemories: (force?: boolean) => Promise<void>;` to `AssistantState`. Implement the action:

```typescript
  loadMemories: async (force = false) => {
    if (!force && get().memories) return; // cached for the session
    try {
      set({ memories: await assistantMemoryRepository.getActive() });
    } catch {
      set({ memories: [] }); // best-effort
    }
  },
```

- [ ] **Step 3c: Debounced scheduler** — add at module scope (next to `currentAbort`):

```typescript
let memoryReviewTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced background memory review for the just-finished exchange. */
function scheduleMemoryReview(userText: string, assistantText: string): void {
  const settings = useSettingsStore.getState().settings;
  if (!settings.assistantMemoryEnabled) return;
  if (userText.trim().length === 0 || assistantText.trim().length === 0) return;
  if (memoryReviewTimer) clearTimeout(memoryReviewTimer);
  memoryReviewTimer = setTimeout(() => {
    memoryReviewTimer = null;
    const aux = settings.assistantMemoryModel.trim() || settings.aiModel;
    void runMemoryReview({
      settings: { ...settings, aiModel: aux },
      userText,
      assistantText,
      existing: useAssistantStore.getState().memories ?? []
    })
      .then(() => useAssistantStore.getState().loadMemories(true)) // refresh cache with new learning
      .catch(() => {});
  }, MEMORY_REVIEW_DEBOUNCE_MS);
}
```

- [ ] **Step 3d: Pre-turn injection** — in `runStreamFrom`, after `await store.getState().loadHistory();` add `await store.getState().loadMemories();`. Then build a snapshot with ranked memories and use it in the runner call. Replace the inline `snapshot: snapshot(),` in the `runAssistantTurnStreaming` input with a pre-built one:

```typescript
  // before currentAbort assignment:
  const lastUserText = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const rankedMemories = rankMemories(store.getState().memories ?? [], lastUserText, MEMORY_INJECT_K);
  const turnSnapshot = { ...snapshot(), learnedMemories: rankedMemories };
```

```typescript
      {
        settings: useSettingsStore.getState().settings,
        snapshot: turnSnapshot,
        messages: toChatTurns(history),
        insights: store.getState().insights,
        history: store.getState().history ?? []
      },
```

- [ ] **Step 3e: Post-turn trigger** — at the end of `onDone`, just before `currentAbort = null;`, add:

```typescript
    if (!aborted && fullReply.trim().length > 0) {
      scheduleMemoryReview(lastUserText, fullReply);
    }
```

- [ ] **Step 3f: Clear cache on conversation clear** — in the `clear` action, add `memories: null` is not required (memory persists across conversations by design), so leave `clear` untouched. (No change — noted intentionally.)

- [ ] **Step 4: Run tests — expect PASS** (`yarn test src/stores/assistantStore.test.ts` and `yarn build`).

- [ ] **Step 5: Commit**

```bash
git add src/stores/assistantStore.ts src/stores/assistantStore.test.ts
git commit -m "feat(memory): pre-turn recall + post-turn debounced review in assistantStore"
```

---

## Task 13: Memory viewer (Settings → AI)

**Files:**
- Create: `src/components/settings/MemoryManager.tsx`
- Test: `src/components/settings/MemoryManager.test.tsx`
- Modify: `src/components/settings/SettingsPage.tsx` (mount it in the AI section, below "About me")

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/settings/MemoryManager.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { MemoryEntry } from "../../services/ai/assistant/memory/types";

const repo = vi.hoisted(() => ({
  getAll: vi.fn(),
  setPinned: vi.fn(async () => {}),
  archive: vi.fn(async () => {}),
  restore: vi.fn(async () => {}),
  updateText: vi.fn(async () => {})
}));
vi.mock("../../db/assistantMemoryRepository", () => ({ assistantMemoryRepository: repo }));

import { MemoryManager } from "./MemoryManager";

function entry(p: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kind: "preference", pinned: false, status: "active", sourceMessageId: null,
    useCount: 0, lastUsedAt: null, createdAt: "2026-06-23T00:00:00.000Z", updatedAt: "2026-06-23T00:00:00.000Z", ...p
  };
}

describe("MemoryManager", () => {
  beforeEach(() => Object.values(repo).forEach((m) => "mockReset" in m && m.mockReset?.()));

  it("lists learned memories", async () => {
    repo.getAll.mockResolvedValue([entry({ id: "a", text: "Prefers mornings" })]);
    render(<MemoryManager />);
    expect(await screen.findByText("Prefers mornings")).toBeInTheDocument();
  });

  it("forgets (archives) a memory", async () => {
    repo.getAll.mockResolvedValue([entry({ id: "a", text: "Likes spicy food" })]);
    render(<MemoryManager />);
    await screen.findByText("Likes spicy food");
    fireEvent.click(screen.getByRole("button", { name: /forget/i }));
    await waitFor(() => expect(repo.archive).toHaveBeenCalledWith("a", expect.any(String)));
  });

  it("shows empty state when nothing learned", async () => {
    repo.getAll.mockResolvedValue([]);
    render(<MemoryManager />);
    expect(await screen.findByText(/hasn't learned anything yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement** (follow the existing styling/tokens used elsewhere in `src/components/settings/`; this is a minimal, correct version)

```tsx
// src/components/settings/MemoryManager.tsx
import { useCallback, useEffect, useState } from "react";
import { assistantMemoryRepository } from "../../db/assistantMemoryRepository";
import type { MemoryEntry } from "../../services/ai/assistant/memory/types";

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

  const active = entries.filter((e) => e.status === "active");
  const archived = entries.filter((e) => e.status === "archived");

  if (loaded && entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        The assistant hasn't learned anything yet. As you chat, durable facts about you appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {active.map((entry) => (
          <li key={entry.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
            <div className="min-w-0">
              <span className="text-xs uppercase text-muted-foreground">{entry.kind}</span>
              <p className="text-sm">{entry.text}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="text-xs underline" onClick={() => void onTogglePin(entry)}>
                {entry.pinned ? "Unpin" : "Pin"}
              </button>
              <button type="button" className="text-xs underline" onClick={() => void onForget(entry.id)}>
                Forget
              </button>
            </div>
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Forgotten ({archived.length})</summary>
          <ul className="mt-2 space-y-2">
            {archived.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 opacity-60">
                <p className="text-sm line-through">{entry.text}</p>
                <button type="button" className="text-xs underline" onClick={() => void onRestore(entry.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
```

> Adjust class names to match the project's actual Tailwind tokens if these differ from what `SettingsPage.tsx` uses; the structure and handlers are what the tests assert.

- [ ] **Step 4: Mount it** — in `src/components/settings/SettingsPage.tsx`, import `MemoryManager` and render it in the AI section directly below the `assistantProfile` ("About me") textarea, with a small heading like "What the assistant has learned".

- [ ] **Step 5: Run tests — expect PASS** (`yarn test src/components/settings/MemoryManager.test.tsx` and `yarn build`).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/MemoryManager.tsx src/components/settings/MemoryManager.test.tsx src/components/settings/SettingsPage.tsx
git commit -m "feat(memory): Memory viewer in Settings → AI (inspect/pin/forget/restore)"
```

---

## Task 14: Full verification + docs

**Files:**
- Modify: `docs/ai-architecture.md` (document the memory subsystem)

- [ ] **Step 1: Run the full suite + build**

Run: `yarn test` then `yarn build`
Expected: all tests PASS; build succeeds. (No Rust changes, so `cargo check` is not required.)

- [ ] **Step 2: Document** — add a "Self-curated memory" subsection under §3 of `docs/ai-architecture.md` describing: the `memory/` pure cores, `assistantMemoryRepository`, pre-turn recall (`rankMemories` → `learnedMemories` → prompt block), post-turn debounced `runMemoryReview` on the aux model, the `assistant_memory` table, the two settings, the Memory viewer, and the invariants (additive, archive-not-delete, validation-drops-never-throws). Cross-link the spec.

- [ ] **Step 3: Commit**

```bash
git add docs/ai-architecture.md
git commit -m "docs: document self-curated assistant memory subsystem"
```

---

## Self-Review (completed while writing this plan)

- **Spec coverage:** background review (T9) ✓; prefetch/inject (T2, T6, T11) ✓; review gate (T3); parser (T4); applyOps dedup/merge/archive/pin (T5); repository archive-not-delete/restore (T8); schema (T1); settings enabled + aux model (T10); store wiring debounce + cheap model (T12); Memory viewer (T13); invariants enforced across T5/T6/T9; testing per file ✓; cost control via gate+debounce+model override (T3/T12) ✓. No uncovered spec section.
- **Placeholder scan:** none — every code/test step carries complete content.
- **Type consistency:** `MemoryEntry`/`MemoryKind`/`MemoryOp`/`MemoryWrite` (T1) are used identically in T2–T13; repo methods `add/updateText/bumpUsage/archive/restore/setPinned/getActive/getAll` match between T8, T9 (`MemoryRepo` = `Pick<…>`), and T13; `rankMemories(all, query, k)`, `MEMORY_INJECT_K`, `MEMORY_REVIEW_DEBOUNCE_MS`, `renderMemoryBlock`, `parseMemoryOps`, `applyMemoryOps(existing, ops, now, makeId)`, `runMemoryReview(input, deps)`, `buildReviewPrompt(exchange, existing)` signatures are consistent across definition and call sites.
