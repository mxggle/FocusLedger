# Yolo AI — Architecture & Feature Reference

A technical reference for everything AI in Yolo: the in-app **assistant**, the
end-of-day **debrief**, the **retrospective** analytics that feed both, and the
external **MCP server**. For the user-facing how-to, see
[`assistant-guide.md`](./assistant-guide.md); this document is the engineering map.

> **Product framing.** Yolo is an *AI-native* productivity app — the throughline
> is "make your time count": plan the day, run one focus, review the truth. The
> assistant's job is to *operate the user's data on command*, not to be a
> read-only chatbot. (Local-first/privacy is explicitly **not** a selling point;
> on-device storage is an implementation detail.)

---

## 1. The four AI surfaces

| Surface | Where | What it does | Entry point |
|---|---|---|---|
| **Assistant** | In-app side panel (`✨`, `⌘/Ctrl+J`) | Conversational agent that reads context and **acts on tasks** (create, edit, categorize, reschedule, complete, start, drop) | `src/services/ai/assistant/` |
| **Focus Debrief** | My Day page + auto-scheduler | One-shot end-of-day narrative ("where the time went / estimate vs reality / one change for tomorrow") | `src/services/ai/debriefService.ts`, `debriefRunner.ts` |
| **Retrospective Intelligence** | Pure analytics (no LLM) | Deterministic calibration / slip / weekly-review numbers, injected into the assistant prompt | `src/services/retrospect/` |
| **MCP Server** | External (Claude Desktop, Cursor, …) | Lets *other* agents read **and manage** the same `yolo.db` over the Model Context Protocol | `mcp/` |

All four share one **provider layer** (`src/services/ai/providers.ts`) and one
principle: **numbers are computed deterministically in TypeScript and only
*narrated* by the LLM** — the model is never asked to do math on raw rows.

---

## 2. Provider layer (bring-your-own-key)

The user supplies their own API key; there is no Yolo-hosted inference.

- **Providers:** `anthropic` (default, `claude-opus-4-8`), `openai` (`gpt-5.1`),
  `gemini` (`gemini-2.5-flash`), `custom` (any OpenAI-compatible base URL, e.g.
  Ollama). Defaults in `DEFAULT_MODELS` ([providers.ts:44](../src/services/ai/providers.ts)).
- **Two call shapes**, both pure request-builders + response-parsers:
  - `buildAiRequest` / `generateText` — **one-shot** (system + single prompt). Used by the debrief.
  - `buildChatRequest` / `generateChat` — **multi-turn** (system + message history). Used by the assistant.
- **Transport:** requests go through the **Tauri HTTP plugin**
  (`@tauri-apps/plugin-http`), i.e. from Rust, so provider APIs that reject
  browser-origin requests still work ([chatClient.ts:1](../src/services/ai/chatClient.ts)).
- **Error mapping:** 401/403 → "check your key", 429 → "rate-limited", else a
  generic HTTP error; empty completions throw. No streaming — one round-trip per call.

```
providers.ts        buildAiRequest / buildChatRequest  (pure, per-provider)
                    parseAiResponse / extractErrorMessage (pure)
aiClient.ts         generateText()  — one-shot,  hasAiKey()
chatClient.ts       generateChat()  — multi-turn
```

---

## 3. The Assistant

### 3.1 Request → response pipeline

```
User types in Composer
        │
        ▼
assistantStore.send(text)                         (src/stores/assistantStore.ts)
        │  builds snapshot() from taskStore + settingsStore
        │  loads insights (retrospect) + history (recall) — cached per session
        │  ranks learned memories for this turn
        ▼
runAssistantToolTurn                              (assistant/assistantRunner.ts)
        │
        │  buildAssistantContext(snapshot, insights)   → AssistantContext
        │  buildAssistantSystemPrompt(ctx)             → system string
        │
        │  ┌── loop, up to MAX_STEPS (12) ────────────────────────┐
        │  │  generateChat(system, messages)                       │
        │  │  parseToolCalls(raw):                                 │
        │  │    • { tool_calls:[…] } → validate args with zod      │
        │  │                           execute or queue writes     │
        │  │                           feed tool results back      │
        │  │    • else              → final Markdown answer        │
        │  └───────────────────────────────────────────────────────┘
        ▼
assistant message stored with ToolCallRecord[]; taskStore.refresh()
        ▼
MessageRow renders reply + ToolCallCard rows (Done / pending / failed / reverted)
```

### 3.2 Tool registry and permission levels

The assistant now has one general tool surface under
[`agentTools/`](../src/services/ai/assistant/agentTools/). Each `AgentTool` has a
name, read/write category, destructive flag, zod parameter schema, prompt hint,
and an `execute()` function over `AgentTaskStore`.

Current tools:

| Category | Tools |
|---|---|
| Read | `list_tasks`, `get_task`, `search_tasks`, `list_categories`, `get_calibration`, `find_free_slots`, `recall`, `recall_conversations`, `daily_summary`, `clarify` |
| Write | `create_task`, `update_task`, `start_task`, `pause_task`, `complete_task`, `move_to_backlog`, `drop_task` |
| Meta | `execute_program` (programmatic tool calling — see §3.9), `clarify` (ask one question instead of guessing) |

`find_free_slots` is pure deterministic schedule math (open gaps in today's plan
that fit a block); like all numbers it is computed in TS and only narrated.
`create_task` defaults a new task to **today** (matching the MCP `add_task`); pass
`due_date: null` for the backlog. `update_task` routes any `status` change through
the dedicated lifecycle methods (`complete/drop/start/pause`) so timers close and
`completed_at`/`dropped_at` stay consistent — it is not a raw status write.

The model may emit:

```json
{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}
```

`runToolLoop` validates args at the boundary. Invalid tools/args are fed back as
tool-result errors; one bad call does not crash the turn. Write calls are gated by
the user's **Assistant autonomy** setting (`PermissionLevel`):

| Level | Behavior |
|---|---|
| `plan` | Reads run; every write is queued as a pending card. |
| `ask` | Reads run; every write is queued as a pending card. |
| `auto` | Reversible writes execute immediately; destructive writes are queued for confirmation. |

Destructiveness is per-call, not just per-tool: a tool may expose `destructiveFor(args)`
so that, e.g., `update_task` with `status: "dropped"` is gated exactly like `drop_task`
instead of slipping through `auto` mode. The JSON loop and the PTC sandbox share the
same `isDestructive` / `needsConfirm` gate.

All write results are stored as `ToolCallRecord`s with status
`executed` / `pending` / `failed` / `reverted` / `dismissed`.

### 3.3 Undo and drift protection

Write tools return an inverse `UndoOp`:

- created tasks return `{ kind: "delete_task", taskId }`;
- edits and state changes return `{ kind: "restore_task", taskId, before }`. The
  `before` snapshot includes the lifecycle timestamps (`completed_at`/`dropped_at`)
  so reverting a done/dropped task clears its stamp instead of leaving it stale.
  (Reopening a closed time entry is out of scope — revert is a best-effort field restore.)

Executed reversible calls render with a **Revert** control. Reverting checks
`expectedUpdatedAt`; if the task changed since the assistant edit, the user must
confirm before the older snapshot is restored. Undo is session/persistence scoped
to the stored assistant message; it is not a global history system.

### 3.4 Context assembled each turn

`buildAssistantContext` ([contextBuilder.ts](../src/services/ai/assistant/contextBuilder.ts))
maps the live `taskStore` snapshot into an `AssistantContext`:

- `today` (the **selected** date the user is viewing), categories, today's tasks,
  capped backlog (`BACKLOG_CAP = 30`), and `allTaskRefs` (id+title for **every**
  task, used to validate ids).
- `briefing` — a deterministic `DayBriefing` (scheduled minutes vs target,
  open/done counts, overcommit) computed in
  [dayBriefing.ts](../src/services/ai/assistant/dayBriefing.ts).
- `profile` — the user's free-text "About me" (`assistantProfile`), when set.
- `retro` — `RetrospectiveInsights`, **only when `hasData`** (additive: no history
  → prompt unchanged).
- `learnedMemories` — the top-ranked active memories for the current turn.
- `permissionLevel` — the autonomy mode shown to the model.
- `plannedStartTime` / `plannedEndTime` for today's and backlog tasks so schedule
  edits can operate on real planned times.

### 3.5 System prompt & the Soul

`buildAssistantSystemPrompt` ([systemPrompt.ts](../src/services/ai/assistant/systemPrompt.ts))
composes, in order:

1. **Soul block** ([soul.ts](../src/services/ai/assistant/soul.ts)) — a product
   preamble (name + the agent contract) followed by either the user's custom `assistantSoul`
   markdown or the shipped `DEFAULT_SOUL` (a "capable operating partner" identity).
2. Optional **About-the-user** profile.
3. The **tool-call contract** (`{ tool_calls:[...] }`) and final-answer rule
   (plain Markdown, no legacy action JSON).
4. The generated tool catalog from `renderToolCatalog()`.
5. **Current context** (date, categories, tasks, backlog).
6. Optional **day briefing**, **learned memories**, and **retrospective** facts.

The prompt includes the honesty rule: `create_task` is only for genuinely new
work the user wants tracked. If the request is unsupported, the assistant must
say so rather than fabricating a task.

### 3.6 State & persistence

`assistantStore` (Zustand) holds `messages`, `status` (`idle`/`thinking`/`error`),
live `steps`, and session-cached `insights`/`history`. Messages persist via
`assistantMessageRepository` (last `HISTORY_LIMIT = 40` restored on launch).
The existing `assistant_messages.actions` JSON column now stores `toolCalls`.
Legacy action-shaped payloads are ignored on hydrate. **Restored pending tool
calls are downgraded to `dismissed`** because they reference a day state that
may have changed
(`restoreHistoryActions`).

### 3.7 UI components (`src/components/assistant/`)

`AssistantPanel` (Radix dialog, framer-motion slide-in) → `BriefingBanner`
(deterministic day glance) + `MessageList` → `MessageRow` → `ToolCallCard`
(Apply / Revert / Done / Failed / Dismissed); `Composer` for input; `EmptyState`
for first-run prompts. Settings → AI includes the **Assistant autonomy** segmented
control (`Plan` / `Ask` / `Auto`).

### 3.8 Self-curated memory (the learning loop)

Ported from the Hermes Agent learning loop
([spec](./superpowers/specs/2026-06-23-assistant-self-curated-memory-design.md)). The
assistant learns durable facts about the user from conversations and recalls the relevant
ones each turn. Code lives in [`assistant/memory/`](../src/services/ai/assistant/memory)
(pure cores) plus [`assistantMemoryRepository`](../src/db/assistantMemoryRepository.ts) and
the `assistant_memory` table.

- **Pre-turn (recall):** `assistantStore` loads active memories (session-cached like
  insights), `rankMemories` picks the top-`MEMORY_INJECT_K` (8) for the user's message —
  deterministically in TS, like the read tools — and they ride into the prompt via
  `AssistantContext.learnedMemories` → `renderMemoryBlock`. The block sits beside the static
  "About me"; both are kept (additive: no memories ⇒ prompt byte-identical to before).
- **Post-turn (review):** after the turn settles, a **debounced**
  (`MEMORY_REVIEW_DEBOUNCE_MS = 1500`) background pass runs — but only if
  `assistantMemoryEnabled` and `reviewGate.shouldReview` passes (skips trivial acks).
  `runMemoryReview` makes **one** aux LLM call on the configurable `assistantMemoryModel`
  (empty ⇒ the main `aiModel`), parses a JSON `MemoryOp[]` (`reviewParser`, invalid dropped),
  folds them (`applyOps`: dedup → usage bump, contradiction → update/archive, pinned
  protected, **archive-not-delete**), and persists. Fire-and-forget — it never blocks or
  breaks a turn.
- **Viewer:** `MemoryManager` (Settings → AI) lists / edits / pins / forgets memories, with a
  "Forgotten" (archived) list to restore.

Invariants: deterministic retrieval (the LLM only *extracts/narrates*, never ranks);
validation drops-never-throws; BYO-key with **no new provider dependency** (no embeddings,
no FTS5).

### 3.9 Programmatic tool calling (PTC, Hermes L2)

For multi-step / bulk / conditional work, the model can emit one `execute_program`
call whose `code` is a small JavaScript program that calls the other tools as async
functions and loops/branches over the results (e.g. *"shift every task 30 min"* →
`const t = await list_tasks(...); for (...) await update_task(...)`). The program runs
in a sandboxed QuickJS VM ([`ptc/sandbox.ts`](../src/services/ai/assistant/ptc/sandbox.ts),
`quickjs-emscripten`): wall-clock timeout, max-call cap, `AbortSignal` honored, **no host
network/filesystem access**. [`ptc/registryBridge.ts`](../src/services/ai/assistant/ptc/registryBridge.ts)
adapts the live registry into sandbox host functions so **writes obey the same permission
gate and record the same reversible `UndoOp`s** as direct calls; deferred writes return a
"queued" sentinel so the program can continue. `runToolLoop` feeds the program's return
value, logs, and per-call results back to the model. If the WASM fails to load, the loop
degrades gracefully (captured error → the model falls back to one-call-at-a-time JSON).

### 3.10 Learned skills (the procedural-memory pillar)

Ported alongside memory: the assistant extracts reusable **skills** from genuinely
multi-step turns and recalls relevant ones each turn. Pure cores live in
[`assistant/skills/`](../src/services/ai/assistant/skills) (rank / render / gate / extract /
parse / applyOps — mirroring `memory/`), with [`assistantSkillRepository`](../src/db/assistantSkillRepository.ts)
and the `assistant_skills` table. Pre-turn: `rankSkills` injects the top-K into the prompt
(additive — empty when none). Post-turn: a debounced, gated, fire-and-forget `runSkillReview`
makes one aux LLM call, parses `SkillOp[]`, folds (dedup → usage bump, pinned protected,
archive-not-delete), and persists. Shares the `assistantMemoryEnabled` learning-loop toggle.

### 3.11 Clarify + cross-session recall

`clarify` lets the agent ask **one** focused question (with optional suggested options)
instead of guessing on an ambiguous request — it ends the turn until the user replies, with
no write side effects. `recall_conversations` searches prior assistant conversations
(persisted in `assistant_messages`, capped window, deterministic keyword rank in TS) so the
agent can answer *"like we discussed before"* across sessions.

---

## 4. Focus Debrief

A separate, **one-shot** AI surface (not part of the assistant loop).

- **Prompt** ([debriefService.ts](../src/services/ai/debriefService.ts)): a fixed
  three-section structure (`Where the time went` / `Estimate vs reality` / `One
  change for tomorrow`), &lt;180 words, output language driven by `aiLanguage`.
  The prompt is built from `TodayStats` + tasks + focus sessions (with stop-notes).
- **Determinism & caching:** temperature 0.2; `debriefInputHash` (djb2) fingerprints
  *exactly* what the model sees, so the My Day page can tell whether regenerating
  would produce anything new. Saved via `debriefRepository`.
- **Auto-scheduler** ([debriefRunner.ts](../src/services/ai/debriefRunner.ts)):
  `shouldRunAutoDebrief` is a pure gate — fire once per day, at/after
  `debriefAutoTime`, only with a key, entries, and not already generated/attempted.

---

## 5. Retrospective Intelligence (no LLM)

Pure functions over time entries + tasks, orchestrated by
`buildRetrospectiveInsights` ([retrospect/index.ts](../src/services/retrospect/index.ts))
over a **30-day window**:

- **Calibration** (`calibration.ts`) — estimate-vs-actual ratio, overall and per
  category, with `low`/`ok` confidence by sample size.
- **Slips** (`slips.ts`) — overdue / lingering / dropped tasks + recurring blocker
  themes.
- **Weekly review** (`weeklyReview.ts`) — this-week vs last-week minutes, top
  category movers, completed/dropped counts.

`loadHistory.ts` is the **only DB-touching file**; everything else is pure and
unit-tested. These insights are injected into the assistant prompt (§3.5) and
power the `get_calibration` read tool — the LLM only *narrates* the numbers.

---

## 6. MCP Server (`mcp/`)

A standalone Model Context Protocol server (better-sqlite3) that lets **external**
agents work on the **same** `yolo.db`. Writes go through the same session rules as
the app (one focus at a time, auto-pause on switch, sub-30s blocks discarded), so
agent actions are indistinguishable from the user's.

- **Read tools:** `list_tasks`, `get_task`, `list_time_entries`, `daily_summary`, `list_categories`.
- **Write tools:** `add_task`, `update_task`, `start_task`, `pause_task`, `complete_task`, `drop_task`.
- **Read-only mode:** `YOLO_MCP_READONLY=1` unregisters writes and opens the DB read-only.
- Each tool carries MCP annotations (`readOnlyHint`, `destructiveHint`) so clients
  apply their own approval policies. Extension seam: `defineTool` + the `tools/index.ts`
  registry; shared deps via `Context`. See [`mcp/README.md`](../mcp/README.md).

> The MCP server is the strategic "AI-native" surface — the same data model
> exposed to any agent, not just the in-app assistant.

---

## 7. Settings (`src/types/settings.ts`)

| Field | Purpose |
|---|---|
| `aiProvider` / `aiApiKey` / `aiModel` / `aiBaseUrl` | provider selection (BYO key) |
| `aiLanguage` | AI output language (empty → model decides) |
| `assistantName` | display name; the Soul answers to it |
| `assistantSoul` | custom identity markdown (empty → `DEFAULT_SOUL`) |
| `assistantProfile` | free-text "About me" read every turn |
| `assistantPermissionLevel` | autonomy level: `plan`, `ask`, or `auto` |
| `assistantMemoryEnabled` / `assistantMemoryModel` | durable memory review gate and optional review model override |
| `dailyFocusTargetMinutes` | drives the day briefing / overcommit logic (default 240) |
| `debriefAutoEnabled` / `debriefAutoTime` | auto-debrief schedule (default off, 23:00) |

Edited in **Settings → AI** (`src/components/settings/SettingsPage.tsx`).

---

## 8. Invariants & design principles

1. **Deterministic math, narrated by the LLM.** Every number (calibration,
   briefing, stats) is computed in TS. The model never sees raw rows to total.
2. **Additive insight.** With no history, the retrospective block is omitted and
   behavior is unchanged.
3. **User-configured autonomy.** `plan`, `ask`, and `auto` determine whether write
   tools are described only, queued for confirmation, or executed in-loop.
   Destructive writes still require confirmation.
4. **Validation at the boundary.** Bad LLM tool calls or arguments are dropped, never
   thrown — one malformed item can't sink a turn.
5. **Pure cores, thin impure edges.** Request-builders, parsers, the tool
   registry, permission checks, revert logic, and retrospective math are injectable;
   DB/network live at named seams (`chatClient`, `loadHistory`, `*Repository`).
6. **Many small files.** One concern per file; registries make capabilities additive.

---

## 9. Extension points

**Add an assistant tool:**
1. Add a focused tool file under
   [`agentTools/`](../src/services/ai/assistant/agentTools/) and export an `AgentTool`.
2. Register it in [`agentTools/registry.ts`](../src/services/ai/assistant/agentTools/registry.ts).
3. For writes, set the correct `permission`, `mutation`, and undo metadata.
4. If it needs a new store operation, extend `AgentTaskStore` and the real
   `taskStore` adapter.
5. Add unit tests for validation, permission behavior, execution, and prompt catalog text.

**Add an MCP tool:** `defineTool(...)` + register in `mcp/src/tools/index.ts` (mark `writes: true`, honest annotations).

---

## 10. Testing & verification

- **Unit:** `vitest` covers providers, the assistant tool registry, permission
  gating, tool loop, response parsing, the system prompt, the soul, day briefing,
  recall, store/UI wiring, and the whole retrospective layer.
  The MCP server has its own suite under `mcp/test/`.
- **Network/DB are injected** (`ToolLoopDeps.generateChat`, `AgentTaskStore`,
  `AgentToolDeps`), so the loop and tools are tested without a provider or a database.
- **Verify changes with:** `yarn build` (tsc + vite), `yarn test`, and
  `cargo check` inside `src-tauri/` for Rust.

---

## 11. File map

```
src/services/ai/
  providers.ts            per-provider request/response (pure)
  aiClient.ts             generateText (one-shot) + hasAiKey
  chatClient.ts           generateChat (multi-turn)
  languages.ts            AI output language options
  debriefService.ts       debrief prompt + generateDebrief + input hash
  debriefRunner.ts        auto-debrief gate + runDebrief
  assistant/
    types.ts              AssistantContext + persisted ChatMessage shape
    contextBuilder.ts     taskStore snapshot → AssistantContext
    soul.ts               product preamble + DEFAULT_SOUL + buildSoulBlock
    systemPrompt.ts       full system prompt composition
    responseParser.ts     parseToolCalls from JSON tool-call envelopes
    toolLoop.ts           JSON tool-call loop, permission gating, MAX_STEPS
    assistantRunner.ts    context/prompt assembly → runToolLoop
    agentTools/
      types.ts            AgentTool, ToolCallRecord, AgentTaskStore
      registry.ts         AGENT_TOOLS + renderToolCatalog
      permissions.ts      plan/ask/auto write gating
      revert.ts           session undo + drift detection
      *.ts                one read/write tool per file
    dayBriefing.ts        deterministic day-load snapshot
    recallHistory.ts      reflections window for the recall tool
    briefingSummary.ts    briefing → banner copy

src/services/retrospect/   calibration / slips / weeklyReview / loadHistory / index (pure)
src/stores/assistantStore.ts   orchestration + persistence + memory hooks + revert
src/components/assistant/      panel, message list, tool-call controls, composer, briefing
mcp/                           external MCP server (read + manage yolo.db)
```
