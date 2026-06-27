# Retrospective Intelligence — a history-aware assistant

**Date:** 2026-06-19
**Status:** Approved, ready for planning

## Summary

Make the Yolo assistant **smart about *you*, not just about *today***. The
existing assistant only sees the current day's tasks + backlog
([contextBuilder.ts](../../../src/services/ai/assistant/contextBuilder.ts)). This
slice adds a **retrospective intelligence layer**: a pure analytics module
computes honest numbers from real time records, and the assistant narrates them
and applies them when planning.

This is the first slice of a larger AI-native direction (retrospective memory →
goals → learning profile). It is the foundation because it needs **no new
schema**, immediately sharpens "plan my day", and de-risks the history-context
plumbing the later slices depend on.

## Decisions

- **Surface:** inside the existing chat assistant. No new route or view. Extends
  `contextBuilder` + `systemPrompt`; insights surface on demand ("How was my
  week?", "Am I underestimating?") and silently sharpen "plan my day".
- **Compute model:** deterministic analytics in TypeScript. The module computes
  the real numbers; the LLM only explains and advises. **The model never does
  arithmetic on raw rows** — it receives a compact, pre-computed facts object.
- **v1 insights (three):**
  - **Estimation calibration** — estimate vs actual time, overall and per
    category. The anchor: it changes planner behavior, not just narration.
  - **Slip & blocker analysis** — tasks repeatedly rescheduled / long-dropped,
    plus recurring themes mined from the per-entry `blocker` field.
  - **Weekly review narrative** — this-week-vs-last-week deltas that tie the
    metrics together; the natural on-demand surface in chat.
- **Deferred:** focus-rhythm (time-of-day) detection — weakest data story until
  the planner reliably sets `planned_start_time`; clean follow-up.
- **Honesty first:** low-sample insights carry a `confidence: low` flag and the
  prompt instructs the assistant to hedge rather than fabricate.
- **Additive only:** every edit to existing files is additive. With no history,
  the assistant behaves exactly as it does today.

## Approaches considered

- **A — Compute in code, LLM narrates (chosen).** Deterministic, cheap on
  tokens, unit-testable, and accurate. The LLM does language, not math.
- **B — Feed raw history to the LLM.** Rejected: LLMs are unreliable at
  arithmetic, it costs more tokens, and it is hard to test.
- **C — Dedicated Insights/Review view.** Rejected for v1: larger build (route,
  UI, charts) and separate from where planning happens. The chat surface is the
  smallest slice that still feels smart on day one.

## Data foundation (already exists — no schema work)

- `timeEntryRepository.getEntriesForRange(startIso, endIso)` returns
  `TimeEntryWithTask[]` — includes `duration_seconds`, `start_at`/`end_at`,
  `task_estimated_minutes`, `category_id`/`category_name`, and per-entry
  `blocker` / `next_action` / `completion_rate`.
- `taskStore` exposes tasks including `status` (`dropped`), `dropped_at`,
  `updated_at`, `due_date`, `priority`, `category_id`.
- Reuse existing helpers where they fit: `statsService`
  (`calculateDateRangeStats`, `splitEntrySecondsByDate`,
  `getStatsRangeForLastSevenDays`) and `lifeService` (`aggregateLifeWeeks`,
  `peakDay`).

## Architecture

```
timeEntryRepository.getEntriesForRange ─┐
taskStore (tasks / dropped)             ├─> retrospect module (pure compute)
statsService / lifeService helpers     ─┘        │
                                                 ▼
                                    RetrospectiveInsights (facts + confidence)
                                                 │  cached in assistantStore on open
                                                 ▼
                            contextBuilder ─> AssistantContext.retro (compact)
                                                 │
                            systemPrompt (honesty + calibration rules)
                                                 ▼
                                    generateChat ─> narrated reply
```

## Components

### `src/services/retrospect/` (new — pure & testable)

| File | Responsibility | Purity |
|------|----------------|--------|
| `loadHistory.ts` | Fetch the 30-day window via `getEntriesForRange` + dropped/rescheduled tasks. | The only impure file (DB access). |
| `calibration.ts` | `computeEstimationCalibration(entries)` → overall + per-category `{ ratio, sampleSize, confidence }`. | Pure. |
| `slips.ts` | `computeSlipAnalysis(tasks, entries)` → lingering/overdue and long-dropped tasks + blocker themes. | Pure. |
| `weeklyReview.ts` | `computeWeeklyReview(thisWeek, lastWeek, calibration, slips)` → week deltas + 2–3 surfaced facts. | Pure. |
| `types.ts` | `RetrospectiveInsights`, `CalibrationStat`, `SlipItem`, `WeeklyReview`, confidence flags. | — |
| `index.ts` | `buildRetrospectiveInsights(window)` orchestrator → one `RetrospectiveInsights`. | Impure (calls `loadHistory`). |

**Calibration detail.** Only entries whose task has a non-null
`task_estimated_minutes` and a meaningful `duration_seconds` count. Ratio =
actual / estimated, aggregated overall and per category. `confidence` is `low`
below a sample threshold (default: fewer than 5 qualifying entries) so the
assistant won't over-claim from thin data.

**Slip detail.** The schema stores no per-day reschedule audit log, so "slip" is
inferred from current task state, not a reschedule count: tasks still `todo` that
are **lingering** (old `created_at`, still open) or **overdue** (past `due_date`,
not done), and tasks `dropped` after a long lifetime (`dropped_at − created_at`).
Blocker themes group recurring substrings/keywords from the `blocker` field. Top
3 by severity are surfaced; the rest are summarized as a count.

**Weekly review detail.** Compares the last 7 days against the prior 7 (total
focused time, per-category shift, completion vs drop counts) and emits a short
list of the most material deltas plus 2–3 concrete adjustments derived from the
calibration and slip outputs.

### Assistant integration (edits — additive)

- `contextBuilder.ts` — add a compact `retro` block to `AssistantContext`:
  rounded ratios, top 3 slips, the few week deltas. Hard-capped for tokens.
  Omitted entirely when there are no insights.
- `types.ts` (assistant) — add `RetrospectiveContext` to `AssistantContext`.
- `systemPrompt.ts` — teach the assistant to (a) cite the real numbers, (b)
  respect `confidence: low` by hedging rather than inventing, and (c) **apply
  the per-category calibration ratio when proposing or adjusting estimates** in
  plan-my-day.
- `assistantStore.ts` — compute insights once when the panel opens, cache for
  the session, expose a `refreshInsights` control. Avoids recompute per
  keystroke. Computation failure degrades gracefully (assistant runs without
  `retro`).

## Data flow

1. Panel opens → `assistantStore` calls `buildRetrospectiveInsights(30d)` once →
   cached.
2. Each turn → `contextBuilder` folds the compact `retro` summary into context
   alongside today's tasks.
3. "How was my week?" → model narrates from the facts object.
4. "Plan my day" → model applies calibration ratios to proposed estimates.

No new per-turn network cost beyond a slightly larger system context.

## Honesty & empty states (critical)

- **Low data:** insights carry `confidence: low` / `insufficient` flags; the
  prompt instructs the assistant to say "I don't have enough history yet"
  instead of fabricating.
- **No history at all:** `retro` block omitted; assistant behaves exactly as
  today. No regression for new users.

## Scope guardrails (YAGNI)

**Out of v1:** focus-rhythm detection, dedicated insights view, proactive /
scheduled cards, persisted personalization profile, charts/visualizations,
goals. **In:** three insights (calibration, slips, weekly review), surfaced in
chat, computed deterministically. All edits additive — no current behavior
changes.

## Testing

- Unit (vitest, colocated `*.test.ts`):
  - `calibration` — ratios, per-category aggregation, the confidence threshold,
    exclusion of entries without estimates.
  - `slips` — repeated-reschedule / long-drop detection, blocker theming, top-N
    + remainder summarization.
  - `weeklyReview` — week-over-week deltas, adjustment derivation.
  - low-data / empty paths for all three.
  - `contextBuilder` includes `retro` when present, omits it when empty.
  - `systemPrompt` carries the calibration + honesty rules.
- `loadHistory` covered via the existing repository test patterns / a thin mock.
- Verify: `yarn build` (tsc + vite) and `yarn test`.

## Why this is the right first slice

It exercises the full history-context plumbing (load → compute → compact →
prompt) end to end, delivers a visibly smarter assistant on day one, requires no
schema migration, and leaves clean seams for the next slices (goals reuse the
same context channel; the learning profile reuses the same compute outputs).
