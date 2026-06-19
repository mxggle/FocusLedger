# Phase 1 — "Paste → smart plan" on a structured agent loop

**Date:** 2026-06-20
**Status:** Approved design, ready for implementation planning
**Roadmap context:** Phase 1 of 3. Phase 2 = memory + semantic recall ("knows everything about me"). Phase 3 = proactive intelligence. This spec covers Phase 1 only.

## Problem

Today's in-app assistant feels "not smart." Root causes, grounded in the code:

- **Stateless context.** `contextBuilder.ts` feeds the model only today's tasks + backlog (capped 30) + categories + aggregate retro numbers. It never sees the user's broader history.
- **Single-shot, no tools, no streaming.** `chatClient.generateChat` does one round-trip; `responseParser` scrapes a JSON blob. The model cannot look things up or reason in steps, and the UI shows a spinner then dumps everything at once.
- **Shallow categorization.** `actions.resolveCategory` only maps to existing categories; it cannot create projects.
- **Brain-dump is a prompt instruction, not a pipeline** — no dedup, no entity awareness, no history-based estimates.

## Goal

Paste any block of text → the assistant *visibly reasons* (scans existing tasks, checks how long similar work takes) → proposes a **deduplicated, auto-categorized, history-calibrated, scheduled** plan as editable confirm-cards.

This also upgrades the everyday chat path: the same agent loop makes ordinary requests smarter (it can look things up before proposing).

## Non-goals (YAGNI for Phase 1)

- Embeddings / semantic memory / cross-session memory → Phase 2.
- OCR, screenshot, email/Slack connectors → later. Phase 1 is pasted text only.
- Token-by-token streaming → later enhancement (progressive step status instead).
- Per-provider native function-calling APIs → replaced by a provider-agnostic JSON loop.
- Merge-into-existing-task on dedup → Phase 1 only skips + notifies.

## Key decisions

### 1. Provider-agnostic structured agent loop
The current `chatClient` is single-shot JSON-text and works uniformly across anthropic/openai/gemini/custom. Native tool-calling would require four fragile provider-specific implementations. Instead, extend the JSON contract:

- The model returns **either** a `lookups` array (read-only tool requests) **or** a final `{ reply, actions }`.
- The runner executes lookups against deterministic TS, appends a synthetic turn containing the results, and re-calls — bounded by `MAX_STEPS = 4`.
- On the final step it parses `{ reply, actions }` exactly as today.

This gives genuine multi-step grounding on every provider and reuses the existing parser.

```
{ "lookups": [ { "tool": "search_tasks", "query": "apartment move" } ] }
   -> runner executes, appends results, re-calls
{ "reply": "...", "actions": [ { "type": "create_task", ... } ] }
```

### 2. Read tools (deterministic TS; LLM never does math)
A small registry in `assistant/tools.ts`. Each tool: `{ name, when, paramsSpec, execute(args, deps) => string }`.

- `search_tasks(query)` — fuzzy/keyword match over `taskStore.allTasks` (title + description). Returns compact `{id, title, status, due_date}` matches. Powers dedup.
- `get_calibration(category?)` — returns the already-computed retrospect calibration ratio (overall or per-category). Powers estimate seeding. No recomputation — reads `RetrospectiveInsights`.
- `get_day_load(date)` *(optional, include if cheap)* — minutes already scheduled on `date` vs. a soft target. Powers capacity-aware scheduling.

Tools receive a `deps` object (`{ allTasks, insights }`) so they stay pure and testable; no new DB-touching file.

### 3. Auto-project via `create_task` (no fragile new action)
Extend `create_task.category` handling: resolve to an existing category id/name; if it matches nothing, treat it as a **new category to create on apply** (ensure-or-create by name). The card surfaces "(new project)" so creation is visible and reviewable. Cards stay self-contained — no cross-card ordering bug where a task references a category card the user dismissed.

- `AssistantTaskStore` gains `ensureCategory(name: string): Promise<string>` (returns category id, creating if absent). `taskStore` already has `createCategory` + `categories`, so the adapter is thin.
- `create_task.validate` records `{ category_id?: string | null, newCategoryName?: string | null }`; `execute` calls `ensureCategory` first when `newCategoryName` is set, then `createTask`.

### 4. Dedup = skip + tell the user
When `search_tasks` reveals a near-match, the model is instructed to **not** create a duplicate and to mention the existing task (by id) in `reply`. Editing/merging into the existing task is deferred to Phase 2.

### 5. Visible reasoning via progressive step status (not streaming)
Streaming response bodies through `@tauri-apps/plugin-http` is uncertain. Instead, each loop iteration emits a live status line via a callback:

- "Scanning your existing tasks…" (on `search_tasks`)
- "Checking how long similar work takes…" (on `get_calibration`)
- "Drafting your plan…" (final step)

`assistantStore` holds `steps: string[]` (current turn) and renders them live; they clear when the assistant message lands. Token streaming is a later enhancement.

### 6. Grouped plan UI
When a turn returns multiple `create_task` proposals, render them as a titled group ("Proposed plan — N tasks") with an **Approve all** control beside per-card edit/approve. Reuses `ActionCard`. `assistantStore` gains `applyAll(messageId)` that applies pending actions sequentially and surfaces per-card failures. Preserves propose-then-confirm.

## Architecture

```
Composer ("Plan this" / paste threshold / normal send)
  -> assistantStore.send(text)
       -> agentLoop.run({ settings, snapshot, messages, insights, onStep })
            build context (systemPrompt + tool catalog)
            loop (<= MAX_STEPS):
              generateChat(...) -> raw
              parse: lookups? -> tools.execute(args, deps) -> append results turn -> continue
                     final?   -> parseAssistantResponse -> { reply, actions }
       -> grouped ProposedAction[]
  -> MessageList renders reply + step trace + grouped plan cards
  -> user approves (per-card or Approve all)
       -> ACTION_REGISTRY[type].execute(params, taskStore)
            create_task: ensureCategory(newCategoryName?) -> createTask
  -> taskStore.refresh()
```

### Files

**New**
- `src/services/ai/assistant/tools.ts` — read-tool registry + `executeLookup`, deterministic, deps-injected.
- `src/services/ai/assistant/agentLoop.ts` — bounded lookup→recall→finalize loop; emits `onStep`; takes injected `generateChat` for tests.

**Changed**
- `responseParser.ts` — distinguish a `lookups` request from a final `{reply, actions}`; expose a small `parseLoopStep(raw)` returning a discriminated union.
- `systemPrompt.ts` — add the read-tool catalog and ingestion rules (decompose brain-dump, dedup via `search_tasks`, seed estimates via `get_calibration`, propose new project via `create_task.category`).
- `actions.ts` + `types.ts` — `create_task` category ensure-or-create + `newCategoryName`; add `ensureCategory` to `AssistantTaskStore`; `describe()` marks "(new project)".
- `assistantStore.ts` — `steps` state + `onStep` wiring; `applyAll`; route "Plan this"; thin `ensureCategory` adapter over `taskStore`.
- `components/assistant/AssistantPanel.tsx`, `MessageList.tsx` — render step trace + grouped plan + Approve all.
- `components/assistant/Composer.tsx` — "Plan this" affordance; auto-hint when pasted text exceeds a length threshold.
- `contextBuilder.ts` — pass an `allTasks` count / hint so the model knows search is available (search itself reads `allTasks` via deps; context stays compact).

## Error handling

- Loop exceeds `MAX_STEPS` → finalize with whatever the last final-shaped response was, else return a short clarifying `reply` with no actions.
- Invalid/unknown lookup → append an error string to the transcript; the model recovers on the next step.
- Invalid actions → dropped as today (`validateAction` returns null).
- `ensureCategory` / `createTask` failure → only that card flips to `failed`; siblings proceed (existing per-card behavior; `applyAll` continues past failures and reports them).
- Provider/network errors → existing toast + `status: "error"` path, unchanged.

## Testing

Deterministic via injected `generateChat` (scripted multi-response).

- `tools.test.ts` — `search_tasks` matching + ranking; `get_calibration` reads insights without recomputation; empty-history behavior.
- `agentLoop.test.ts` — lookup→recall→finalize (two scripted responses); `MAX_STEPS` cutoff; lookup error recovery.
- `responseParser.test.ts` — lookups vs final discrimination; malformed → plain reply.
- `actions.test.ts` — `create_task` existing-category resolution, new-category ensure-or-create, dedup skip path.
- `assistantStore` — `applyAll` sequential apply + per-card failure; `steps` lifecycle.
- Keep coverage ≥ current. Verify with `yarn build`, `yarn test`.

## Invariants preserved

- Numbers computed in TS, only narrated by the LLM (calibration via `get_calibration`).
- Propose-then-confirm: every mutation is an editable card the user approves.
- Additive: with no history and no paste, behavior matches today (loop degenerates to a single final-shaped response).
