# Assistant Revamp — "Soul" Identity + Wider Capability

**Date:** 2026-06-20
**Status:** Design (approved in brainstorming)
**Author:** brainstorming session

## Problem

The in-app assistant feels "not smart enough." Two concrete, reproducible failures:

1. **It can't edit existing tasks.** A user asked it to "auto categorize every task"; it
   replied it can only assign a category when *creating* a task and "can't change the
   category of existing tasks." This is not a prompt issue — there is no `update_task`
   action in the vocabulary ([actions.ts](../../../src/services/ai/assistant/actions.ts)).
   The model reported its real limits correctly.

2. **It is workflow-locked.** The system prompt's first line hardcodes
   *"You are the Yolo Assistant, a focused day-planning companion"*
   ([systemPrompt.ts](../../../src/services/ai/assistant/systemPrompt.ts)), which steers
   the model to refuse anything outside day-planning. There is no configurable identity —
   the only personalization is a single free-text `assistantProfile` ("About me").

The user wants a real assistant with its own identity ("soul"), modeled on
[Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality)
and [OpenClaw](https://nader.substack.com/p/how-to-build-a-custom-agent-framework),
and wants it able to operate on the user's data broadly rather than within fixed flows,
following [Pi](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) agent-loop
best practices.

## Goals

- Give the assistant a configurable **Soul** (identity) that replaces the hardcoded
  day-planning framing — fixing the workflow-lock and giving it personality.
- Let it **edit existing tasks** and operate in **bulk** (e.g. categorize many tasks at
  once), so "do anything with my tasks" actually holds.
- Stay faithful to Pi's minimal-loop philosophy (no new agent framework dependency).

## Non-goals / deferred

- **Editing time entries** and other data types. Tasks + categories cover the reported
  complaint; time-entry editing is a larger surface deferred to a follow-on spec.
- **Multiple named personas / profile switching** (Hermes "profiles"). One editable Soul
  for now (YAGNI).
- Changing the **propose-then-confirm invariant**. Every change still becomes a confirm
  card the user approves. This preserves the [CLAUDE.md](../../../CLAUDE.md) invariant.

## Decisions (from brainstorming)

- **Capability/safety model:** *Wider, still confirm.* Widen what the agent can touch;
  keep propose-then-confirm for every change.
- **Persona model:** *Like Hermes.* A **SOUL** block occupies **slot #1** of the system
  prompt and **replaces** the hardcoded identity (not additive).
- **Soul editor:** *Raw markdown SOUL* — one scaffolded textarea, sections
  Identity / Style / Avoid / Defaults.
- **Data scope this phase:** *Tasks + categories.*
- **Pi integration:** *Adopt the patterns*, not the `pi-coding-agent` npm package
  (which ships bash/file tools that don't fit a Tauri task app).

## Architecture

### A. The Soul (identity layer)

**New settings** (in `AppSettings`, [types/settings.ts](../../../src/types/settings.ts)):

- `assistantName: string` — default `"Yolo Assistant"`. The name the agent answers to.
- `assistantSoul: string` — markdown. Default `""`; when blank, `DEFAULT_SOUL` is used so
  behavior is well-defined without configuration.

`assistantProfile` (existing) is unchanged in storage but **repurposed in the prompt** as
"About the user" (slot #2). No migration needed.

**New file `src/services/ai/assistant/soul.ts`:**

- `DEFAULT_SOUL: string` — a shipped SOUL.md-style block that frames the assistant as a
  *broadly capable operator over the user's tasks and time*, with day-planning as one
  strength among many (not its definition). Sections: **Identity / Style / Avoid /
  Defaults**. Written so default behavior is already better than today.
- `buildSoulBlock(name: string, soul: string): string` — composes the slot-#1 block.
  Uses `DEFAULT_SOUL` when `soul` is blank. Keeps the Yolo product context (app name,
  "make your time count", that proposals are confirm cards) as a short fixed preamble so a
  user-written Soul can't strand the agent without product grounding.

**`systemPrompt.ts` change:** replace the two hardcoded identity lines with
`buildSoulBlock(ctx.assistantName, ctx.assistantSoul)`. Everything below slot #2 (actions,
tools, context, briefing, retro) is unchanged in mechanics.

**Threading:** `AssistantContext` ([types.ts](../../../src/services/ai/assistant/types.ts))
gains `assistantName: string` and `assistantSoul: string`; `AssistantStoreSnapshot` and
`buildAssistantContext` ([contextBuilder.ts](../../../src/services/ai/assistant/contextBuilder.ts))
pass them through from settings. The assistant runner/store already pass `profile`; it
passes `assistantName`/`assistantSoul` the same way.

### B. Wider capability vocabulary

**New action `update_task`** (in [actions.ts](../../../src/services/ai/assistant/actions.ts),
type added to `AssistantActionType`):

- **Params:** `task_id` (required, must be a known id), and any of:
  `title`, `description`, `category` (existing name/id OR new project name — reuse
  `resolveCategoryOrNew`), `priority`, `estimated_minutes`. At least one field besides
  `task_id` must be present, else the action is invalid and dropped.
- **destructive:** `false`.
- **describe:** human summary listing which fields change, e.g.
  `Update "Anki feature": category → Japanese, priority → high`.
- **execute:** maps to existing `taskStore.updateTask(id, UpdateTaskInput)`. When a new
  category name is given, `ensureCategory` first (same pattern as `create_task`).
- `AssistantTaskStore` interface gains `updateTask(taskId, input): Promise<ActionResult>`.
  The real store already implements `updateTask`; add a thin adapter if its return shape
  differs from `ActionResult`.

**New read tool `list_tasks`** (in [tools.ts](../../../src/services/ai/assistant/tools.ts)):

- **When:** the agent needs to enumerate a set to operate on in bulk (e.g. "categorize
  every task") — `search_tasks` requires a query and can't enumerate.
- **Params (all optional):** `status` (e.g. `todo|doing|done`), `category` (name/id, or the
  literal `none` for uncategorized), `undated` (boolean — backlog only). No params = all
  tasks (capped).
- Returns a capped list (`MAX_SEARCH_RESULTS`-style cap, e.g. 40) of
  `- [id] "title" (status, category)` lines, plus a "+N more" note when truncated, so the
  agent knows to narrow its filter. Pure function over `deps.allTasks`.

**Bulk apply:** no new mechanism — the model already returns an actions array and the store
already has `applyAll` ([assistantStore.applyAll.test.ts](../../../src/stores/assistantStore.applyAll.test.ts)).
The system prompt's "Handling complex or long requests" guidance is extended: for bulk edits
the agent should `list_tasks` to get the set, then emit one `update_task` per task; the UI's
existing "Apply all" handles approval in one click.

### C. Pi-aligned loop

The loop in [agentLoop.ts](../../../src/services/ai/assistant/agentLoop.ts) is already
Pi-shaped (read-only lookups → final `{reply, actions}`). Changes:

- Keep the toolset minimal — only `list_tasks` is added (Pi's "what you leave out matters").
- The Soul is the AGENTS.md/SOUL.md equivalent: per-instance identity in slot #1.
- Raise `MAX_STEPS` from 4 to 6 to give bulk reasoning (enumerate → propose) headroom.
  No other structural change.

## UI

In [SettingsPage.tsx](../../../src/components/settings/SettingsPage.tsx), add an **Assistant**
subsection (near the existing AI block that holds "About me"):

- **Name** — `Input` bound to `assistantName`.
- **Soul** — a `textarea` bound to `assistantSoul`, with placeholder/scaffold showing the
  four sections (Identity / Style / Avoid / Defaults) and a one-line hint: "This defines who
  your assistant is and how it behaves. Leave blank to use the default." A small "Reset to
  default" affordance writes `DEFAULT_SOUL` into the box so users can edit from a known base.
- **About me** — unchanged, relabeled context hint "About *you* (the assistant reads this to
  tailor its work)" to distinguish it from the Soul (about the *assistant*).

## Data flow

User edits Soul/Name/About-me in Settings → persisted in `AppSettings` via the settings
store/repository (existing path) → on each assistant turn, `buildAssistantContext` reads them
from the snapshot → `buildAssistantSystemPrompt` renders slot #1 (Soul) + slot #2 (About the
user) → model proposes `{reply, actions}` → actions validated (`update_task` included) →
rendered as confirm cards → user approves (individually or Apply all) → `taskStore` mutates.

## Error handling

- `update_task` with no editable fields, unknown `task_id`, or bad `priority`/date → invalid,
  dropped silently (existing `validateAction` contract: one bad action can't sink a turn).
- `list_tasks` never throws; returns an error/empty string the model can read (existing tool
  contract).
- Blank Soul/Name → defaults applied in `soul.ts`, never an empty slot #1.
- A user-written Soul that contradicts the confirm-card rule cannot bypass confirmation:
  validation and the card layer are independent of prompt text.

## Testing (TDD)

- `soul.test.ts`: `buildSoulBlock` uses `DEFAULT_SOUL` when blank; includes name; keeps the
  product preamble; passes through a custom soul.
- `systemPrompt.test.ts`: slot #1 is the soul block; hardcoded "day-planning companion" line
  is gone; About-the-user still rendered from profile.
- `actions.test.ts`: `update_task` validates partial field sets, rejects empty/unknown id,
  resolves existing + new categories, describes the diff; invalid → null.
- `tools.test.ts`: `list_tasks` filters by status/category/undated, caps with "+N more",
  empty handling.
- `contextBuilder.test.ts`: name/soul threaded from snapshot.
- `agentLoop.test.ts`: bulk path (lookup `list_tasks` → multiple `update_task` actions) within
  raised `MAX_STEPS`.
- Maintain existing ≥ current coverage; all of `yarn test`, `yarn build` green.

## Files touched

| File | Change |
|------|--------|
| `src/types/settings.ts` | +`assistantName`, `assistantSoul` (+ defaults) |
| `src/services/ai/assistant/soul.ts` | **new** — `DEFAULT_SOUL`, `buildSoulBlock` |
| `src/services/ai/assistant/systemPrompt.ts` | slot #1 → soul block |
| `src/services/ai/assistant/types.ts` | `AssistantContext` +name/soul; `AssistantActionType` +`update_task`; `AssistantTaskStore` +`updateTask` |
| `src/services/ai/assistant/contextBuilder.ts` | thread name/soul |
| `src/services/ai/assistant/actions.ts` | +`update_task` descriptor |
| `src/services/ai/assistant/tools.ts` | +`list_tasks` lookup |
| `src/services/ai/assistant/agentLoop.ts` | `MAX_STEPS` 4→6; step label for `list_tasks` |
| `src/stores/taskStore.ts` | `updateTask` adapter to `ActionResult` if needed |
| `src/components/settings/SettingsPage.tsx` | Assistant section (Name, Soul, relabeled About me) |
| `docs/assistant-guide.md` | document Soul + new capabilities |
| `*.test.ts` | tests per above |

## Risks

- **Prompt bloat** vs Pi minimalism: the Soul replaces (not adds to) the old identity, and
  `list_tasks` output is capped — net neutral. Watch total prompt size in tests.
- **Bulk over-proposing**: cap `list_tasks` and instruct the agent to confirm scope when a
  bulk edit would exceed a sensible count (e.g. ask before proposing 20+ cards).
- **A user-written Soul that's vague/hostile**: the fixed product preamble + validation layer
  keep the agent grounded and safe regardless.
