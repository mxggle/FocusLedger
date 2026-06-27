# Assistant Modernization — Streaming, Modern Chat UX

**Date:** 2026-06-20
**Status:** Design (approved in brainstorming)
**Author:** brainstorming session
**Reference aesthetic:** Claude / Linear

## Problem

The in-app assistant's UI reads like a 3-year-old chatbot while the product's
positioning is **AI-native**. Concrete "dated" signals:

- **Classic asymmetric chat bubbles** (user = primary right, AI = muted left, cut-corner
  tails). Modern AI UIs (Claude, ChatGPT, Cursor, Raycast) dropped bubbles for full-width
  rows with avatars and plain markdown.
- **No avatars, no hover toolbar** (copy / regenerate / edit), no timestamps.
- **Non-streaming reply.** `assistantStore.send` sets `result.reply` in one shot via
  `runAssistantTurn` → `runAgentLoop`, which calls `generateChat` (one network round-trip,
  no streaming). The whole message pops in at once.
- **Thinking indicator** is a static dotted list. Modern baseline is a shimmering skeleton
  / streaming cursor.
- **Composer keyboard is reversed from convention:** ⌘+Enter sends, plain Enter inserts a
  newline. Today's default is Enter sends, Shift+Enter newline. No mode chips, no stop
  button, no slash commands.
- **Empty state** starters are plain text pills rather than richer intent cards.
- No scroll-to-bottom button, no edit-message, no regenerate.

## Goals

- Make the assistant look and feel like a modern AI product (Claude / Linear vocabulary),
  using the existing Linear-grade design tokens — no new tokens.
- Add **token streaming** with a stop button, streamed over the existing provider layer.
- Add the interaction affordances users now expect: hover toolbar (copy / regenerate /
  edit), collapsible reasoning panel, scroll-to-bottom, slash commands, mode chips.
- Keep the **propose-then-confirm** action invariant, the agent loop's tool set, the
  retrospective insights, and the persisted conversation memory untouched.

## Non-goals

- No new design tokens; no dark/light theme changes.
- No DB schema changes (Phase 3 edit uses `deleteAfter`, not a new table).
- No changes to the propose-then-confirm action invariant, retrospective insights, or the
  agent loop's tool set (`tools.ts`, `actions.ts`, `contextBuilder.ts`).
- No mobile/responsive work beyond the existing `max-w-[92vw]` drawer cap.
- No persistence of streaming partial state across app restarts (only completed turns
  persist, same as today).
- No Rust changes; `cargo check` is not required for any phase.

## Execution strategy

**Phased (Approach B).** Each phase is independently shippable and reviewable.

| Phase | Scope | Runner touched? | Shippable alone? |
|-------|-------|-----------------|------------------|
| 1 | Visual rewrite (no streaming) | No | Yes |
| 2 | Streaming + stop | Yes (runner + providers) | Yes |
| 3 | Slash commands + edit message | No (store + UI only) | Yes |

A brief intermediate state exists after Phase 1: the assistant looks modern but doesn't
stream yet. This is acceptable — Phase 1 is the fastest perceived win and Phase 2's
runner/provider risk is isolated.

---

## Section 1 — Layout & visual language (Phase 1)

### 1.1 Panel shell (mostly preserved)

- Right-side drawer, 420px, spring slide-in, overlay, floating trigger button —
  **unchanged** ([AssistantPanel.tsx](../../../src/components/assistant/AssistantPanel.tsx)).
- **Header refresh:** avatar (24px `primary-soft` circle + `Sparkles`) + name + a thin
  `Model · Provider` sublabel (muted, 11px) + a tiny status dot (idle / thinking). Right
  side: Clear + Close. Replaces the plain title row.
- **BriefingBanner:** content unchanged; trim padding slightly to match the new density.

### 1.2 Message rows (the big visual change — bubbles → full-width rows)

- Container: `space-y-6` (was `space-y-4`), more breathing room.
- **Assistant row:** avatar at top-left; markdown rendered **plainly with no bubble
  background** (just text, like Claude / Linear). Action cards stack below the text
  (components unchanged). Hover reveals a quiet top-right toolbar
  (`opacity-0 group-hover:opacity-100`): **Copy**, **Regenerate**. Hover also reveals an
  11px timestamp near the avatar.
- **User row:** right-aligned quiet block —
  `bg-surface border border-border rounded-lg px-3.5 py-2 max-w-[85%]`, **no tail corner**.
  Hover reveals an **Edit** pencil that turns the block into an inline input; submitting
  re-runs from that turn (drops everything after).
- No inter-row hairlines — pure spacing.

### 1.3 Thinking / streaming visuals

- **Reasoning panel** (collapsible, reuses the existing `steps` array from the agent loop):
  a `bg-surface-2 rounded-md px-3 py-2` row above the reply with a chevron + "Thinking"
  label. While generating: animated dots + current step label, shimmer on the active step.
  After: collapsed by default; expand to see completed steps with check icons. Older
  turns: collapsed, muted.
- **Pre-first-token skeleton:** 3 shimmer lines (`h-3 rounded-full bg-muted` +
  `animate-shimmer`) instead of the current static dot list.
- **Streaming cursor** (Phase 2): a thin blinking caret appended to streaming text.

### 1.4 Composer (the other big change)

- Same surface container, but with a **toolbar row** below the textarea:
  - **Left: mode chips** — `Plan` (default; wraps input in the existing
    "Organize the following into well-scoped tasks…" prefix) vs `Quick` (sends as-is).
    Replaces the conditional "Plan this" button with a persistent toggle.
  - **Right:** char hint + **send button** that becomes a **Stop** button (filled,
    `destructive-soft`) while generating (real wiring in Phase 2; disabled shell in
    Phase 1).
- **Keyboard flipped:** Enter sends, Shift+Enter newline (was ⌘+Enter). Hint copy updated.
- Auto-focus composer on panel open.
- **Slash commands** (Phase 3, but the composer shape accommodates them now): typing `/`
  opens a popover above the textarea with filtered options; arrow + Enter to pick.

### 1.5 Empty state

- Keep centered avatar + name + tagline.
- Replace plain pill starters with a **2×2 intent-card grid**: each card has an icon, a
  label, and a one-line sublabel. Clicking sends the corresponding prompt. Same 4 intents
  as today, just richer.

**No new design tokens needed** — everything uses the existing Linear-grade palette,
`animate-shimmer`, `rounded-*`, `shadow-*` already in
[tailwind.config.ts](../../../tailwind.config.ts).

---

## Section 2 — Streaming architecture (Phase 2)

### 2.1 New runner contract — `runAssistantTurnStreaming`

A streaming variant is added **alongside** (not replacing) `runAssistantTurn`:

```ts
type StreamCallbacks = {
  onStep?: (label: string) => void;              // lookup steps (unchanged)
  onToken?: (chunk: string) => void;             // incremental reply text
  onActions?: (actions: ProposedAction[]) => void; // parsed at end
  onDone?: (fullReply: string) => void;
  onError?: (err: Error) => void;
  signal?: AbortSignal;                          // stop button
};
```

The agent loop structure is preserved:

- **Lookup rounds (steps 0..N-1):** unchanged, non-streamed, fast. Emit `onStep` per
  lookup. `parseLoopStep` still decides final-vs-lookups.
- **Final turn:** streamed. Calls a new `streamChat(settings, input, { onToken, signal })`.

### 2.2 Final-turn format change (the one prompt / parser impact)

Today the final turn is `{ "reply": "...markdown...", "actions": [...] }` JSON, which
makes streaming the markdown reply require a partial-JSON string extractor (fiddly:
escaped quotes, depth tracking).

**New final-turn contract: markdown first, then a fenced actions block at the end:**

~~~
Here's your plan for today…

1. **Ship the landing page** — 90 min, high priority
…

```json
[{ "type": "create_task", "params": {…} }, …]
```
~~~

- `parseAssistantResponse` gains a branch: if a ` ```json ` fence exists near the end,
  everything before the fence = reply, the fence contents = actions array.
  **Backward-compatible fallback:** if the whole thing is `{reply, actions}` JSON, the
  existing branch handles it.
- `parseLoopStep` is unaffected (intermediate turns keep `{lookups:[…]}` JSON; the final
  turn has no `lookups` key → still classified `final`).
- System prompt gets a one-paragraph "Final answer format" instruction swap. Low risk —
  the prompt is already ours.

This makes streaming the reply trivial (stream raw text until the fence marker appears)
and action parsing robust (parse a complete fenced block once, at the end).

### 2.3 Transport layer — `streamChat` in chatClient.ts

New function next to `generateChat`:

```ts
export async function streamChat(
  settings: AiSettings,
  input: ChatInput,
  cb: { onToken?: (chunk: string) => void; signal?: AbortSignal }
): Promise<string>  // returns the full accumulated text
```

- Sets `stream: true` in the provider body.
- Per-provider SSE parsing: Anthropic (`content_block_delta` → `delta.text`), OpenAI /
  custom (`choices[0].delta.content`), Gemini (`candidates[0].content.parts[0].text` via
  SSE).
- Uses `fetch` from `@tauri-apps/plugin-http`; reads `response.body` (ReadableStream) with
  a `TextDecoder` + line-buffered SSE parser.
- **Fallback:** if `response.body` is absent / non-streaming, `await response.text()` once
  and call `onToken` with the full buffer. UI is identical.
- Abort: `AbortController` wired to the Stop button; abort throws a handled `AbortError`
  that the store treats as a clean stop (keeps partial reply, no error toast).

> **Note:** the Tauri HTTP plugin (`@tauri-apps/plugin-http` v2.5.9) `fetch` shim's
> streaming behavior can't be fully verified without runtime testing. The design decouples
> UI streaming state from the transport: if `response.body` isn't usable, tokens arrive in
> one batch and the UI still works (just no live cursor). This is verified during Phase 2
> implementation with a manual provider check.

### 2.4 Store changes (assistantStore.ts)

- New status: `"thinking"` stays; add a `streamingReply: string` field that grows via
  `onToken`.
- `send()`:
  1. Append user message (unchanged).
  2. Run lookups via the streaming runner — `onStep` updates `steps`.
  3. On first `onToken`: append a placeholder assistant message with `content: ""` +
     `status: "streaming"`.
  4. Each `onToken`: patch the last message's `content` (append chunk) — throttled via
     `requestAnimationFrame` to avoid React thrash on fast streams.
  5. `onActions`: `autoApplyActions` as today, then patch the message with final `actions`.
  6. `onDone`: set `status: "idle"`, persist to DB.
- **Stop:** `abortController.abort()`; the partial `streamingReply` is kept as the message
  content, `status: "idle"`, a muted "Stopped" footnote. Persisted.

> **Regenerate / edit land in Phase 3.** They depend on the streaming primitive this
> phase delivers but their store wiring + UI (hover toolbar buttons, inline editor) are
> Phase 3 work. In Phase 1 the toolbar renders visually but Regenerate / Edit are inert
> stubs; in Phase 2 only Stop is live. Phase 3 wires them: regenerate drops the last
> assistant message and re-runs the `send` flow from the preceding user message (no new
  user message appended); edit drops all messages after the edited turn, replaces its
  content, and re-runs.

### 2.5 Partial-JSON safety

Because actions are fenced and only parsed on `onDone`, there's no partial-action state —
cards never appear mid-stream. If the fence is malformed at the end,
`parseAssistantResponse` falls back to "reply = whole text, no actions" (existing
behavior).

### 2.6 What does NOT change

- `agentLoop.ts` lookup logic, `tools.ts`, `actions.ts`, `contextBuilder.ts`,
  `systemPrompt.ts` structure, `autoApply.ts`, the DB repository, retrospective insights,
  the propose-then-confirm invariant.

---

## Section 3 — Phase 3 details, file plan & testing

### 3.1 Slash commands

- **Trigger:** typing `/` at the start of the composer (or after a space) opens a
  Radix-style popover anchored above the textarea. `filter` narrows by substring as you
  type.
- **Keyboard:** ArrowUp/Down to move, Enter/Tab to insert, Esc to close. Plain Enter (no
  selection) still sends per Phase 1 rules.
- **Commands:**
  - `/plan <text>` → sends with the existing "Organize the following into well-scoped
    tasks…" prefix (same as the Plan mode chip).
  - `/today` → sends "How is today looking?"
  - `/reschedule` → sends "Reschedule what I didn't finish to tomorrow."
  - `/backlog` → sends "Review my backlog and propose what to schedule this week."
  - `/clear` → local action: clears conversation (calls `store.clear`), no model call.
    Shows a toast "Conversation cleared."
- **Insertion behavior:** picking a command inserts its name + a space (e.g. `/plan `),
  keeps the textarea focused, doesn't send. The user types the rest and sends normally.
  `/clear` is the only one that executes immediately.
- **Mode chips coexist:** if a slash command sets the mode (only `/plan` does), it also
  flips the Plan chip active. Otherwise chips stay independent.

### 3.2 Edit user message

- Hover on a user row reveals an **Edit** pencil (top-right of the block).
- Click → the block becomes an inline auto-growing textarea prefilled with the message
  content, with **Save / Cancel** affordances.
- **Save:** drops all messages *after* the edited message, replaces its content, re-runs
  `send` from there (same streaming flow as a new send). The dropped assistant turn is
  replaced by a fresh streamed one.
- **Cancel:** restores the original block.
- Persisted history reflects the edit (the dropped messages are removed from DB via the
  repository).

### 3.3 File plan across phases

**Phase 1 — visual (no runner / provider changes):**
- `src/components/assistant/AssistantPanel.tsx` — header refresh (avatar, model/provider
  sublabel, status dot).
- `src/components/assistant/MessageList.tsx` — `space-y-6`, scroll-to-bottom button +
  visibility logic.
- `src/components/assistant/MessageBubble.tsx` → rename / replace with `MessageRow.tsx` —
  full-width row, avatar, no bubble, hover toolbar (Copy / Regenerate for assistant),
  Edit for user, timestamp.
- `src/components/assistant/Composer.tsx` — keyboard flip, mode chips (Plan / Quick),
  auto-focus, Stop button shell (disabled; real wiring in Phase 2).
- `src/components/assistant/EmptyState.tsx` — 2×2 intent-card grid.
- New `src/components/assistant/ReasoningPanel.tsx` — collapsible panel reusing `steps`.
- New `src/components/assistant/ScrollToBottomButton.tsx`.
- `assistantStore.ts` — minor: `regenerateLast()` and `editUserMessage()` stubs return
  `not-implemented` (Phase 3 fills in; Phase 1 UI can call them but they're inert or
  hidden behind a flag). Copy is pure-UI (clipboard plugin), no store change.

**Phase 2 — streaming:**
- `src/services/ai/chatClient.ts` — add `streamChat()`.
- `src/services/ai/providers.ts` — add `stream: true` to bodies; SSE delta types per
  provider (types only; parsing logic lives in chatClient).
- `src/services/ai/assistant/assistantRunner.ts` — add
  `runAssistantTurnStreaming()`.
- `src/services/ai/assistant/agentLoop.ts` — extract the lookup loop; the streaming
  variant streams only the final turn.
- `src/services/ai/assistant/responseParser.ts` — add fenced-actions branch + keep legacy
  `{reply,actions}` fallback.
- `src/services/ai/assistant/systemPrompt.ts` — final-turn format instruction swap.
- `src/stores/assistantStore.ts` — `streamingReply`, `abortController`, streaming
  `send`, real Stop wiring, persist partial on abort.
- `MessageRow.tsx` — streaming cursor + live content binding to `streamingReply`.

**Phase 3 — commands + edit:**
- `src/components/assistant/Composer.tsx` — slash-command popover + `/clear` handling.
- New `src/components/assistant/SlashCommandMenu.tsx` — popover + filtering + keyboard
  nav.
- New `src/components/assistant/MessageEditor.tsx` — inline editor for user messages.
- `src/stores/assistantStore.ts` — real `regenerateLast()`, `editUserMessage()`
  (drop + re-run).
- `src/db/assistantMessageRepository.ts` — `deleteAfter(messageId)` if not already
  present.

### 3.4 Testing strategy

**Existing tests to keep green:**
`assistantRunner.test.ts`, `agentLoop.test.ts`, `responseParser.test.ts`,
`systemPrompt.test.ts`, `actions.test.ts`, `autoApply.test.ts`,
`contextBuilder.test.ts`, `briefingSummary.test.ts`, `dayBriefing.test.ts`,
`recallHistory.test.ts`, `tools.test.ts`, `soul.test.ts`, `providers.test.ts`.

**New tests per phase:**
- **Phase 1:** component tests for `MessageRow` (toolbar visibility), `Composer` (Enter
  sends / Shift+Enter newline, mode chips toggle), `EmptyState` (intent cards send
  correct prompts), `ReasoningPanel` (expand / collapse), `ScrollToBottomButton`
  (visibility threshold).
- **Phase 2:**
  - `responseParser.test.ts` — new cases: fenced-actions parsing, malformed fence →
    fallback, legacy `{reply,actions}` still works.
  - `chatClient.test.ts` (new) — `streamChat` with a mocked `fetch` returning SSE lines;
    delta accumulation per provider; abort mid-stream resolves with partial; fallback when
    `response.body` missing.
  - `agentLoop.test.ts` — streaming variant: lookup rounds still non-streamed, final turn
    streams, `onToken` / `onActions` / `onDone` fire in order.
  - `assistantStore` streaming integration (existing test pattern) — append placeholder on
    first token, patch on tokens, actions on done, stop keeps partial.
- **Phase 3:** `SlashCommandMenu` filtering / keyboard nav; `MessageEditor` save / cancel;
  store `editUserMessage` drops-then-reruns; `regenerateLast` re-runs without duplicate
  user message.

**Verification gates (per AGENTS.md):**
- After each phase: `yarn build` (tsc + vite) + `yarn test` (vitest).
- Phase 2: manual check that streaming works against a real provider (the Tauri HTTP
  plugin streaming behavior can't be fully unit-tested).
- No Rust changes in any phase, so `cargo check` is not required.

### 3.5 Non-goals (restated)

- No new design tokens, no dark / light theme changes.
- No DB schema changes (Phase 3 edit uses `deleteAfter`, not a new table).
- No changes to the propose-then-confirm action invariant, retrospective insights, or the
  agent loop's tool set.
- No mobile / responsive work beyond the existing `max-w-[92vw]` drawer cap.
- No persistence of streaming partial state across app restarts (only completed turns
  persist, same as today).
