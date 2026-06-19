# Phase 2a — "About Me" user profile the assistant always knows

**Date:** 2026-06-20
**Status:** Approved design, ready for implementation
**Roadmap:** First shippable slice of Phase 2 (memory + "knows everything about me"). Cross-session conversation memory and semantic recall are later slices (2b, 2c).

## Problem
The assistant has no durable knowledge of who the user is — their role, ongoing
projects, working hours, goals, or vocabulary. Every turn starts cold. The user
explicitly wants an assistant that knows their background and context.

## Goal
A persistent, user-editable **profile** ("About Me", in the user's own words) that is
injected into every assistant turn, so proposals and answers reflect the user's real
situation.

## Decision: store as a settings field (no new table)
`settingsRepository` is a key-value store that JSON-serializes any `AppSettings` key.
Adding `assistantProfile: string` persists with **zero migration** and reuses the
existing settings load/save path. A free-text field (the user's own words) is the
simplest, most flexible representation; structured fields and auto-derivation are
deferred.

## Changes
- `src/types/settings.ts` — add `assistantProfile: string` to `AppSettings` and `""`
  to `DEFAULT_SETTINGS`.
- `src/services/ai/assistant/types.ts` — `AssistantContext` gains `profile?: string`.
- `src/services/ai/assistant/contextBuilder.ts` — `AssistantStoreSnapshot` gains
  `profile?: string`; `buildAssistantContext` sets `profile` only when non-empty (trimmed).
- `src/services/ai/assistant/systemPrompt.ts` — render an "About the user (in their own
  words):" section near the top when a profile is present.
- `src/stores/assistantStore.ts` — `snapshot()` reads `assistantProfile` from settings.
- `src/components/settings/SettingsPage.tsx` — a full-width textarea in the AI section
  bound to `updateSetting("assistantProfile", …)`.

## Invariants
- Additive: empty profile ⇒ prompt and behavior identical to today.
- Propose-then-confirm and deterministic-math invariants untouched (profile is plain
  context, no math).

## Testing
- `contextBuilder.test.ts` — profile passes through when set; omitted when blank.
- `systemPrompt.test.ts` — profile rendered when present; absent section when blank.
- Build + full suite green.
