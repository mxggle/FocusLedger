# Yolo Assistant — chat + day planner

**Date:** 2026-06-18
**Status:** Approved, implementing

## Summary

Add an **in-app chat assistant that is also the day planner** — one feature, not
two. A right-side slide-over panel where the user talks to a planner that can
*read* their day and *propose* concrete changes to tasks and schedule. Changes
are **propose-then-confirm**: the assistant returns chat text plus confirmable
action cards, and nothing mutates until the user clicks Apply.

Built entirely on the existing provider-agnostic AI layer
(`src/services/ai/`) and the existing `taskStore` mutation surface. All edits to
existing files are additive — no current behavior changes.

## Decisions

- **Surface:** right-side slide-over panel (~420px) over any route. Toggle via a
  `Sparkles` button in the shell + a global shortcut. Mounted once in `App.tsx`,
  alongside `QuickAddDialog` / `FocusZenOverlay`.
- **Conversation:** ephemeral (not persisted). The message/action model is
  structured cleanly so DB-backed persistence is a later drop-in, not a rewrite.
- **Action model:** propose-then-confirm. Per-action Apply/Dismiss plus "Apply
  all". Destructive actions (drop) route through the existing `confirm()` dialog.
- **LLM access:** reuse the existing configured AI settings (`aiProvider`,
  `aiApiKey`, `aiModel`, `aiBaseUrl`). No new provider config.
- **No native tool-calling.** The assistant acts via **structured JSON output**
  (`{ reply, actions[] }`), which is provider-agnostic and keeps the existing
  lowest-common-denominator design intact.
- **No streaming** in v1 — a "thinking" indicator, matching the existing
  one-shot debrief pattern.

## Approaches considered

- **A — Structured-JSON actions (chosen).** Model returns `{ reply, actions[] }`;
  app validates and renders action cards. Works across all four providers,
  reuses `generateText`/`generateChat`, keeps the user in control.
- **B — Native tool-calling.** Rejected: provider-specific (Anthropic / OpenAI /
  Gemini APIs differ), would break the provider-agnostic layer.
- **C — Free-text advice only.** Rejected: not actually a planner.

## Extensibility — the action registry (the core extension point)

A registry of self-contained assistant actions. Each action:

```
AssistantAction = {
  type: AssistantActionType,           // e.g. "create_task"
  validate(raw): Params | error,       // boundary validation of untrusted LLM output
  describe(params, ctx): string,       // human label for the confirm card
  execute(params, taskStore): Promise<MutationResult>,
  promptSpec: { name, when, params },  // contributes to the generated system prompt
}
```

- The system prompt is **generated from the registry**, so adding a capability is
  one new file — no prompt drift, no parser/UI changes.
- The response parser rejects unknown action `type`s and malformed params, so a
  new action is inert until both the registry entry and prompt spec exist.

**v1 actions:** `create_task`, `reschedule_task`, `move_to_backlog`, `drop_task`,
`complete_task`, `start_task`. These cover "plan my day", "reschedule what I
didn't finish", and "add these tasks". Each maps to an existing `taskStore`
method returning `MutationResult`.

## New / changed files

```
src/services/ai/
  chatClient.ts        NEW  generateChat(settings, {system, messages[], temperature, maxTokens})
  providers.ts         EDIT add optional messages[] path to buildAiRequest; generateText unchanged
  assistant/
    actions.ts         NEW  the action registry (extension point)
    contextBuilder.ts  NEW  builds day-state context from taskStore (mirrors debriefService)
    systemPrompt.ts    NEW  prompt generated from registry + JSON output contract
    responseParser.ts  NEW  parse + validate model JSON -> { reply, actions[] }
    assistantRunner.ts NEW  one turn: context + history -> generateChat -> parsed result
src/stores/
  assistantStore.ts    NEW  ephemeral messages[], pending actions, status (DB-ready shape)
  uiStore.ts           EDIT add ephemeral assistantOpen + toggleAssistant (mirrors focusZen)
src/components/assistant/
  AssistantPanel.tsx   NEW  slide-over shell (Radix + framer-motion)
  MessageList.tsx      NEW
  MessageBubble.tsx    NEW  reuses DebriefContent markdown renderer for replies
  ActionCard.tsx       NEW  per-action Apply / Dismiss
  Composer.tsx         NEW  input + send + stop
  EmptyState.tsx       NEW  starter chips + expectation-setting line
src/App.tsx            EDIT mount <AssistantPanel/> once; add toggle button + shortcut wiring
```

## Data flow (one turn)

```
User types -> assistantStore.send()
  -> contextBuilder snapshots today's tasks / backlog / categories / stats
  -> systemPrompt (from registry) + message history + context -> generateChat()
  -> responseParser validates JSON -> { reply, actions[] }
  -> store appends assistant message + pending action cards
User clicks Apply on a card
  -> action.execute(params, taskStore) -> MutationResult
  -> taskStore.refresh() (UI already reactive) -> card marked done / toast on failure
```

## UX (AI best-practices, matched to Yolo tone)

- **In control:** per-action Apply/Dismiss + "Apply all"; drops use the existing
  `confirm()` dialog and `destructive` tokens.
- **Expectation-setting:** empty state with starter chips ("Plan my day", "What
  should I focus on?", "Reschedule what I didn't finish") and a one-line "Yolo
  Assistant suggests changes; you approve them."
- **Honest states:** no API key -> inline nudge linking Settings -> AI (reuses
  `hasAiKey`); loading -> thinking indicator; errors -> friendly messages from
  `aiClient`; regenerate + clear-conversation controls.
- **A11y:** Radix focus trap, `aria-live="polite"` on the reply region, full
  keyboard path, Esc to close.
- **Tone:** same warm-but-candid coach voice as the debrief system prompt; reuse
  `DebriefContent`'s markdown renderer for replies.

## Testing

- Unit (vitest, colocated `*.test.ts`):
  - `responseParser` — valid / malformed / partial JSON, unknown action types.
  - each action's `validate`.
  - `contextBuilder` and `systemPrompt` generation.
  - `assistantRunner` with a mocked `generateChat`.
- Verify: `yarn build` (tsc + vite) and `yarn test`.

## Scope guardrails (YAGNI)

Out of v1: persisted history, streaming, native tool-calling, voice, multi-day
planning, calendar integration. The action registry and clean store shape leave
the door open for all of them without rework.
