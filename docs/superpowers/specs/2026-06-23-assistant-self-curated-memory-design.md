# Self-curated assistant memory (Hermes learning-loop port)

**Date:** 2026-06-23
**Status:** Approved design, ready for spec review
**Roadmap:** Delivers the **auto-derivation of user knowledge** that Phase 2a
([2026-06-20-ai-native-phase2a-user-profile-design.md](./2026-06-20-ai-native-phase2a-user-profile-design.md))
explicitly deferred ("structured fields and auto-derivation are deferred"). It is the
first of three "grows-with-you" pillars ported from the Hermes Agent learning loop;
**learned skills** and **cross-session conversation recall** are later slices.

## Provenance (what we are porting)
[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) (MIT) earns its
"the agent that grows with you" tagline from a **closed learning loop**. We port the
*memory half* of it, adapted to Yolo's TypeScript/Tauri stack and BYO-key constraint:

| Hermes module | What it does | Yolo equivalent here |
|---|---|---|
| `agent/background_review.py` | After a turn, forks a cheap aux agent that replays the exchange and asks "should anything be saved to memory?" | `memory/runMemoryReview.ts` (gated, debounced, one aux LLM call) |
| `agent/memory_manager.py` | `prefetch_all()` before a turn injects relevant memory; `sync_all()` after a turn persists | pre-turn `retrieve.ts` + `injectMemory.ts`; post-turn `runMemoryReview.ts` |
| `agent/curator.py` (archive-not-delete, pinned protected) | Maintains the store without destroying anything | `applyOps.ts` invariants (archive only, pinned protected) |

We deliberately **do not** port: subagent forks/threads, FTS5-as-dependency, embeddings,
or autonomous skill creation (a later pillar).

## Problem
The assistant's only durable model of the user is a **static, hand-written** "About me"
string (`assistantProfile`, read every turn). It never learns. Across sessions it starts
cold on everything the user has actually told it — preferences ("I batch admin on
Fridays"), corrections ("stop padding estimates"), recurring context ("the Q3 launch is my
priority"). This is the core reason the assistant "feels dumb" next to Hermes.

## Goal
The assistant **learns durable facts about the user from conversations**, stores them, and
**recalls the relevant ones every turn** — with the user able to see, edit, pin, and forget
anything it has learned. The hand-written "About me" stays authoritative; learned memory is
**additive** on top of it.

## Decisions (locked)
1. **Scope:** self-curated memory only (skills + conversation recall are later slices).
2. **Transparency:** memories are written **silently** (no confirm cards), but a **Memory
   viewer** in Settings → AI lets the user inspect / edit / pin / forget them.
3. **Cost:** the background review is **gated + debounced** and runs on a **configurable
   cheaper model** (`assistantMemoryModel`, empty ⇒ reuse the main model). One call per
   reviewed turn; output-only (no tools).
4. **Retrieval in TypeScript** (no FTS5 / no embeddings dependency for v1) — load active
   memories and rank top-K in pure TS, mirroring the existing `tools.ts` / `ToolDeps`
   keyword-scan pattern. FTS5 stays a later optimization if volume grows.

## Architecture
New folder `src/services/ai/assistant/memory/` — all pure except two named impure edges —
plus one repository, two settings keys, and one Settings UI section.

```
User turn ──► assistantStore.send(text)
  PRE-TURN (read path):
    load active memories (session-cached, like loadInsights)
    retrieve.rankMemories(all, userText, K)        (pure, TS)
      → AssistantContext.learnedMemories
    systemPrompt injects "What you've learned about the user" block   (additive)
  ──► runAgentLoop … → reply + actions              (UNCHANGED)
  POST-TURN (write path; fire-and-forget after onDone + autoApply):
    reviewGate.shouldReview(userText, assistantText)     (pure heuristic — cost guard)
    runMemoryReview:
      reviewPrompt.build(exchange, relatedExisting)
      generateChat({...settings, aiModel: assistantMemoryModel||settings.aiModel})
      reviewParser.parse(raw) → MemoryOp[]               (invalid dropped, never throws)
      applyOps.applyMemoryOps(existing, ops) → { nextEntries, writes }  (pure dedup/merge)
      assistantMemoryRepository.<add|update|archive>(...)  (best-effort)
```

## Schema (added to the idempotent migration runner, like `assistant_messages`)
```sql
CREATE TABLE IF NOT EXISTS assistant_memory (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,            -- 'preference' | 'workstyle' | 'context' | 'fact'
  text          TEXT NOT NULL,            -- the learned fact, one sentence, the user's framing
  pinned        INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'archived' (archive = soft delete)
  source_message_id TEXT,                 -- assistant_messages.id that produced it, nullable
  use_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assistant_memory_status ON assistant_memory(status);
```
`CREATE TABLE IF NOT EXISTS` slots into the existing runner with no version bump (same
approach as the `assistant_messages` table).

## Components

### Pure core (unit-tested, no DB / no network)
- **`memory/types.ts`** — `MemoryKind`, `MemoryEntry`, and `MemoryOp`
  (`{ op: 'add'|'update'|'archive'|'skip', … }`).
- **`memory/retrieve.ts`** — `rankMemories(all: MemoryEntry[], query: string, k: number): MemoryEntry[]`.
  Score = keyword overlap(query, text) + recency + `pinned` boost + `useCount` boost; pinned
  entries are always eligible. Pure; mirrors the `tools.ts` ranking style. Returns ≤ K
  (`MEMORY_INJECT_K = 8`, exported constant).
- **`memory/reviewGate.ts`** — `shouldReview(userText, assistantText): boolean`. Skip
  trivial turns (short acks like "thanks"/"ok", pure tool-result echoes); fire when the turn
  carries preference / correction / personal-detail / expectation signals. Cheap, pure,
  conservative-but-not-silent (errs toward reviewing substantive turns).
- **`memory/reviewPrompt.ts`** — `buildReviewPrompt(exchange, relatedExisting): { system, messages }`.
  Ports Hermes's `_MEMORY_REVIEW_PROMPT` intent (persona, preferences, work-style,
  expectations). Shows the related existing memories so the model dedups instead of
  duplicating. Demands a strict JSON `MemoryOp[]` output (or `[]`).
- **`memory/reviewParser.ts`** — `parseMemoryOps(raw): MemoryOp[]`. Extracts the JSON array
  (tolerates fences/prose, like `responseParser`), validates each op, **drops invalid ones,
  never throws**.
- **`memory/applyOps.ts`** — `applyMemoryOps(existing, ops): { nextEntries, writes }`.
  Deterministic: near-duplicate guard (normalized-text match) collapses `add` of an existing
  fact into a touch/`update`; `update` merges text + bumps `updated_at`; `archive` flips
  status (**never hard-deletes**); **pinned entries are protected** from archive/overwrite.
  Returns the concrete repo write list.
- **`memory/injectMemory.ts`** — `renderMemoryBlock(entries): string`. Ranked entries →
  prompt block; **empty in ⇒ empty out** (additive guarantee).

### Thin impure edges (injected for tests, like `chatClient` / `loadHistory`)
- **`src/db/assistantMemoryRepository.ts`** — Repository pattern (mirrors
  `assistantMessageRepository`): `getActive()`, `add(entry)`, `update(id, patch)`,
  `archive(id)`, `setPinned(id, bool)`, `getAll()` (viewer incl. archived), `restore(id)`.
- **`memory/runMemoryReview.ts`** — orchestrates gate → prompt → `generateChat` (cheap model
  via `{...settings, aiModel}` — **no new provider plumbing**) → parse → apply → persist.
  **Debounced, non-blocking, swallows all errors.** Injectable `generateChat` + repo.

### Wiring (small diffs to existing files)
- **`types.ts` / `contextBuilder.ts`** — `AssistantContext` (and the snapshot) gain
  `learnedMemories?: MemoryEntry[]`, set only when non-empty.
- **`systemPrompt.ts`** — render the learned-memory block **next to** the existing static
  `profile` block. Both kept: "About me" is authoritative, learned memory is additive
  ("What you've learned about the user — you may use or refine this:").
- **`assistantStore.ts`** — pre-turn: load + session-cache active memories (like `insights`),
  `rankMemories` for the user text, pass into the snapshot; post-turn: after `onDone` +
  `autoApply`, schedule debounced `runMemoryReview(exchange)` fire-and-forget
  (`MEMORY_REVIEW_DEBOUNCE_MS = 1500`, so rapid back-and-forth coalesces into one review).

### Settings (`src/types/settings.ts`)
- `assistantMemoryEnabled: boolean` (default **true**).
- `assistantMemoryModel: string` (default **""** ⇒ reuse `aiModel`). Reuses the existing
  `{...settings, aiModel}` call path — no new provider code.

### UI — Memory viewer (Settings → AI)
A section beneath "About me" (one home for assistant identity & knowledge): list active
memories grouped by `kind`, with inline **edit**, **pin**, and **forget** (archive);
a collapsed "Forgotten" list with **restore**. Read-mostly, small. (A shortcut from the
assistant panel header is a later nice-to-have, out of scope here.)

## Invariants (Yolo's, preserved)
- **Never blocks/breaks a turn.** The review is post-turn, fire-and-forget, catch-all; a
  failed/parse-error review leaves the conversation untouched.
- **Validation at the boundary.** Invalid memory ops dropped, never thrown (one bad op can't
  sink a review).
- **Additive.** No memories ⇒ system prompt is byte-identical to today.
- **Archive, not delete** (recoverable); **pinned protected** — matches Hermes's curator rule.
- **Deterministic retrieval** in TS; the LLM only *extracts/narrates*, never ranks or does math.
- **BYO-key, no new dependency.** No embeddings endpoint, no FTS5 requirement; the review
  reuses the user's configured provider/key.

## Cost control
Extra spend per turn = at most **one** aux call, only when `assistantMemoryEnabled` **and**
`reviewGate` passes, debounced so rapid back-and-forth coalesces, on the (optionally cheaper)
`assistantMemoryModel`. Disabling the setting removes all extra cost and makes behavior
identical to today.

## Out of scope (later slices)
- **Learned skills / playbooks** + curator maintenance (pillar 2).
- **Cross-session conversation recall** — FTS5/semantic search + summarization over full chat
  history (pillar 3; supersedes the deferred Phase 2b-2 recall).
- Embedding-based semantic memory retrieval.
- Auto-folding the static "About me" into the memory store (kept separate for now).
- Re-ranking memory via the in-loop read tools (memory is injected, not a `lookups` tool, in v1).

## Testing
Match the existing injected-deps, 80%+ pattern:
- `retrieve.test.ts` — ranking order, K cap, pinned always eligible, empty input.
- `reviewGate.test.ts` — trivial acks skipped; substantive/correction/personal turns pass.
- `reviewParser.test.ts` — valid ops parsed; fenced/noisy output tolerated; invalid dropped; never throws.
- `applyOps.test.ts` — dedup collapses re-adds; update merges; archive soft-deletes; pinned protected.
- `injectMemory.test.ts` — block rendered when present; empty string when none.
- `runMemoryReview.test.ts` — gate short-circuits (no LLM call); on pass, injected
  `generateChat` result flows through parse → apply → repo writes; errors swallowed.
- `assistantMemoryRepository.test.ts` — mock `getDatabase`; assert SQL for add/update/archive/getActive/restore.
- `systemPrompt.test.ts` / `contextBuilder.test.ts` — learned-memory block additive; absent when empty.
- Verify: `yarn build` (tsc + vite) + `yarn test` green.
