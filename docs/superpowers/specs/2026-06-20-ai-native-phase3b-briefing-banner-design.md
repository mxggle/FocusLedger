# Phase 3b — Glanceable proactive briefing banner

**Date:** 2026-06-20
**Status:** Approved design, ready for implementation
**Roadmap:** Final slice of Phase 3. Makes the day briefing *come to the user* in the UI
without them having to ask, and without spending an API call to render.

## Problem
Phase 3a made the assistant proactive *within a chat* (it flags overcommit when asked). But
the user still has to open a conversation and prompt it. There's no at-a-glance, automatic
signal when they open the assistant.

## Goal
A compact, deterministic **briefing banner** at the top of the assistant panel that always
shows today's shape (scheduled vs target, status) with a single contextual action
("Plan my day" / "Trim my day" / "Fill from backlog"). Rendering needs no LLM call; only the
action button sends a prompt (and only when an API key is configured).

## Decision: deterministic summary + thin UI
Reuse the existing `computeDayBriefing` (Phase 3a). Add a pure `summarizeBriefing` that turns
a `DayBriefing` into a human headline + tone + optional CTA. The banner is a thin component
that reads the briefing from the stores via a small hook. No new state, no scheduling, no
notifications — consistent with the deterministic-narration invariant (here the "narration"
is fixed TS copy, not an LLM).

## Pure module — `src/services/ai/assistant/briefingSummary.ts`
```ts
type BriefingTone = "info" | "warn" | "good";
type BriefingCta = { label: string; prompt: string };
type BriefingSummary = { headline: string; tone: BriefingTone; cta: BriefingCta | null };
formatMinutes(total: number): string            // 90 -> "1h 30m", 60 -> "1h", 45 -> "45m", 0 -> "0m"
summarizeBriefing(b: DayBriefing): BriefingSummary
```
Branch by `b.status`:
- `empty` → info; CTA "Plan my day" when backlog has items, else none.
- `overcommitted` → warn; CTA "Trim my day" (prompt asks what to defer).
- `light` → info; CTA "Fill from backlog" when backlog has items.
- `balanced` → good; no CTA.

## UI
- `src/components/assistant/useDayBriefing.ts` — hook mapping `taskStore.tasks` (today),
  `backlogTasks.length`, and `settings.dailyFocusTargetMinutes` into `computeDayBriefing`.
- `src/components/assistant/BriefingBanner.tsx` — renders the headline with tone styling and,
  when a CTA exists and an API key is configured, a button that calls `assistantStore.send`
  (disabled while thinking).
- `AssistantPanel.tsx` — render `<BriefingBanner />` between the header and the message list.

## Invariants
- Deterministic: the banner is fixed TS copy over computed numbers; no model call to display.
- Additive/safe: empty/zero-target days read naturally; the button is inert without a key.
- Propose-then-confirm preserved: the CTA only *sends a prompt*; any change still arrives as
  confirm cards.

## Testing
- `briefingSummary.test.ts` — `formatMinutes` cases; each status → headline/tone/CTA, and the
  backlog-gated CTAs.
- Build + full suite green. (Banner/hook are thin glue, verified by build + manual.)
