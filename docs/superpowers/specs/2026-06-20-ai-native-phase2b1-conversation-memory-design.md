# Phase 2b-1 — Persistent assistant conversation memory

**Date:** 2026-06-20
**Status:** Approved design, ready for implementation
**Roadmap:** First slice of Phase 2b. Semantic/lexical recall over full task/time history is a later slice (2b-2).

## Problem
Assistant messages live only in Zustand memory — they vanish on app restart. The
assistant cannot remember past sessions, which the user explicitly wants ("past
sessions / entire history").

## Goal
Persist the conversation so it survives restarts and is restored on launch. The model
then sees prior discussion for continuity.

## Decision: a dedicated table + repository (mirror existing repos)
Conversations are append-heavy and unbounded, so a settings key is the wrong fit. Add an
`assistant_messages` table and an `assistantMessageRepository`, following the existing
`debriefRepository` / `timeEntryRepository` pattern. Persistence is **best-effort** (like
`loadInsights`): failures never break a turn.

## Schema (added to `SCHEMA_STATEMENTS` in `migrations.ts`)
```sql
CREATE TABLE IF NOT EXISTS assistant_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,            -- 'user' | 'assistant'
  content TEXT NOT NULL,
  actions TEXT,                  -- JSON of ProposedAction[] (assistant turns), nullable
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_created ON assistant_messages(created_at);
```
`CREATE TABLE IF NOT EXISTS` is idempotent, so it slots into the existing migration runner
with no version bump.

## Repository — `src/db/assistantMessageRepository.ts`
- `append(message: ChatMessage): Promise<void>` — INSERT one row; `actions` is
  `JSON.stringify(message.actions)` or null.
- `getRecent(limit: number): Promise<ChatMessage[]>` — newest `limit` rows by
  `created_at`, returned **chronological** (oldest first); parses `actions` JSON.
- `clear(): Promise<void>` — `DELETE FROM assistant_messages`.

## Store wiring — `src/stores/assistantStore.ts`
- `hydrate(): Promise<void>` — load `getRecent(HISTORY_LIMIT = 40)`; on load, map any
  action with `status: "pending"` to `"dismissed"` so stale proposals from a previous
  session are not actionable. Best-effort (catch → leave empty).
- `send` — after appending the user message and after the assistant message, call
  `assistantMessageRepository.append(...)` fire-and-forget (`.catch` swallows).
- `clear` — also fire `assistantMessageRepository.clear()` (best-effort); signature stays
  `() => void`.

## App startup — `src/App.tsx`
Add a `useEffect` that calls `useAssistantStore.getState().hydrate()` once on mount.

## Out of scope (later slices)
- Rolling summarization / prompt-size bounding beyond the 40-message hydrate cap.
- Re-persisting action status changes mid-session (apply/dismiss). Acceptable: on next
  launch, restored proposals show as dismissed.
- Semantic/lexical recall over tasks + time entries (2b-2).

## Testing
- `assistantMessageRepository.test.ts` — mock `getDatabase`; assert INSERT params for
  `append`, the ORDER BY + chronological re-sort and JSON parsing for `getRecent`, and the
  DELETE for `clear`.
- `assistantStore` — mock the repository; `hydrate` populates messages and downgrades
  pending actions to dismissed; `clear` calls `repository.clear`.
- Build + full suite green.
