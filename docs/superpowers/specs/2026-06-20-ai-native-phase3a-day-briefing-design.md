# Phase 3a — Proactive day briefing

**Date:** 2026-06-20
**Status:** Approved design, ready for implementation
**Roadmap:** First slice of Phase 3 (proactive intelligence). End-of-day/weekly debrief
loops are a later slice (3b) and reuse the existing `debriefService`.

## Problem
The assistant is reactive: it waits to be asked and has no sense of whether today is
overloaded, empty, or balanced. It can't proactively say "you've packed 6 hours into a
4-hour target" or "today's empty — want to pull from the backlog?"

## Goal
Compute a deterministic **day briefing** (scheduled load vs the user's focus target,
open/done counts, backlog size, and a derived status) and inject it into the assistant
context, so the model can proactively flag overcommitment / light days and ground
"plan my day" in real numbers.

## Decision: deterministic signals in TS, narrated by the LLM
Consistent with the codebase invariant, all numbers are computed in TypeScript; the model
only narrates and proposes. No new data sources — uses today's tasks (already in context)
and the existing `dailyFocusTargetMinutes` setting.

## Data shape — `src/services/ai/assistant/dayBriefing.ts`
```ts
type DayBriefingStatus = "empty" | "light" | "balanced" | "overcommitted";
type DayBriefing = {
  scheduledMinutes: number;   // sum of estimates for OPEN tasks today (todo/doing/paused)
  targetMinutes: number;      // dailyFocusTargetMinutes
  overcommitMinutes: number;  // max(0, scheduled - target) when target > 0
  openCount: number;
  doneCount: number;
  backlogCount: number;
  status: DayBriefingStatus;
};
computeDayBriefing(today: ContextTask[], backlogCount: number, targetMinutes: number): DayBriefing
```
Status rules: `openCount === 0` → `empty`; else target>0 and `scheduled > target` →
`overcommitted`; else target>0 and `scheduled < target*0.5` → `light`; else `balanced`.

## Wiring
- `contextBuilder.ts` — `AssistantStoreSnapshot` gains `targetMinutes?: number` (default 0);
  `buildAssistantContext` always attaches `briefing` computed from the mapped today-tasks,
  full backlog length, and the target.
- `types.ts` — `AssistantContext` gains `briefing?: DayBriefing`.
- `systemPrompt.ts` — render a "Today at a glance" line; add a proactive rule: when the day
  is overcommitted or empty, say so and offer one concrete adjustment grounded in the
  numbers; when asked to plan the day, respect the focus target.
- `assistantStore.ts` — `snapshot()` passes `targetMinutes` from settings.
- `EmptyState.tsx` — make the first starter a clean "Plan my day" prompt.

## Invariants
- Deterministic numbers; LLM narrates only.
- Additive: target 0 / no tasks ⇒ briefing is benign (`empty`/`balanced`) and the prompt
  reads naturally; existing behavior unchanged.
- Propose-then-confirm untouched.

## Testing
- `dayBriefing.test.ts` — scheduled sum over open tasks only; each status transition;
  overcommit math; target 0 path.
- `contextBuilder.test.ts` — briefing attached with correct counts and minutes.
- `systemPrompt.test.ts` — "Today at a glance" + proactive rule present.
- Build + full suite green.
