# Phase 2b-2 — Lexical recall over work history

**Date:** 2026-06-20
**Status:** Approved design, ready for implementation
**Roadmap:** Final slice of Phase 2. Vector/semantic embeddings remain a deliberate
non-goal (deterministic, zero-new-dependency approach chosen).

## Problem
The assistant can search existing *tasks* (`search_tasks`) but has no access to what the
user actually *did* — the reflections logged on time entries (notes, blockers,
next-actions). So it can't answer "what did I learn last time I worked on X?" or
"what keeps blocking this?" from real history.

## Goal
A read tool, `recall`, that lexically searches the trailing window of **time-entry
reflections** (note / blocker / next-action, joined with task title + category + date) and
returns the most relevant dated snippets for the model to ground its answer.

## Decision: lexical, deps-injected, no embeddings
Consistent with the codebase's deterministic ethos and no-new-dependency constraint, recall
uses keyword scoring (same approach as `search_tasks`) over a bounded, pre-loaded window.
Vector embeddings are intentionally deferred. The history window is loaded once per session
and cached, mirroring how retrospective `insights` are loaded.

## Data shape
```ts
// compact, prompt-friendly slice of a TimeEntryWithTask reflection
type RecallEntry = {
  date: string;            // YYYY-MM-DD (from start_at)
  taskTitle: string;
  category: string | null;
  note: string | null;
  blocker: string | null;
  nextAction: string | null;
};
```

## Loader — `src/services/ai/assistant/recallHistory.ts`
- `toRecallEntries(entries: TimeEntryWithTask[]): RecallEntry[]` — **pure**; keeps only
  entries with at least one non-empty reflection field, maps to `RecallEntry`. Testable.
- `loadRecallEntries(now, windowDays = 60, cap = 80): Promise<RecallEntry[]>` — impure
  boundary; calls `timeEntryRepository.getEntriesForRange`, applies `toRecallEntries`,
  returns the most recent `cap`.

## Tool — `src/services/ai/assistant/tools.ts`
- `ToolDeps` gains `history: RecallEntry[]`.
- New `recall` tool: keyword-scores each entry over
  `taskTitle + note + blocker + nextAction + category`, returns the top matches as dated
  lines, e.g. `- [2026-06-12] "Write report" (Deep Work): blocked — waiting on data`.
  No matches / no history → a clear, non-throwing message.

## Wiring
- `agentLoop.ts` — `RunAgentLoopInput` gains `history?: RecallEntry[]`; `ToolDeps` build
  passes `history: input.history ?? []`.
- `assistantRunner.ts` — input gains `history?`, forwarded to the loop.
- `assistantStore.ts` — load recall entries once per session (cached field `history`,
  best-effort like `insights`) and pass into `runAssistantTurn`.
- `systemPrompt.ts` — one rule: use `recall` for questions about past work, blockers, or
  lessons learned. (Tool catalog already lists it automatically.)

## Invariants
- Deterministic: recall only retrieves and formats; the LLM narrates. No math.
- Additive: no history ⇒ `recall` returns "no history yet" and behavior is unchanged.
- Propose-then-confirm untouched (recall is read-only).

## Testing
- `recallHistory.test.ts` — `toRecallEntries` filters empties and maps fields + date.
- `tools.test.ts` — `recall` matches on note/blocker/task title, ranks, and reports empty
  history gracefully; `toolCatalog` lists `recall`.
- `systemPrompt.test.ts` — recall guidance present.
- Build + full suite green.
