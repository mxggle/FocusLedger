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
        ▼
runAssistantTurn ──► runAgentLoop                 (assistant/agentLoop.ts)
        │
        │  buildAssistantContext(snapshot, insights)   → AssistantContext
        │  buildAssistantSystemPrompt(ctx)             → system string
        │
        │  ┌── loop, up to MAX_STEPS (6) ─────────────────────────┐
        │  │  generateChat(system, messages)                       │
        │  │  parseLoopStep(raw):                                  │
        │  │    • { lookups:[…] }  → executeLookup() each, feed    │
        │  │                          results back as a user turn  │
        │  │    • else             → final answer, break           │
        │  └───────────────────────────────────────────────────────┘
        ▼
parseAssistantResponse(raw, ctx)  →  { reply, actions: ProposedAction[] }
        │
        ▼
autoApplyActions(actions, taskStore)              (assistant/autoApply.ts)
        │  reversible actions → execute NOW, mark "applied"
        │  destructive actions → leave "pending" (await confirm)
        ▼
assistant message stored with executed actions; taskStore.refresh()
        ▼
MessageBubble renders reply + ActionCards (done / pending-confirm)
```

### 3.2 Execution model — **agent, not form** (the key design)

Historically every proposed change rendered as a confirm card the user had to
click. That made bulk operations ("categorize all 19 backlog tasks") collapse
into a wall of "Apply" buttons. The current model is **graduated autonomy**,
decided by the agent itself — the user never configures it:

- **Reversible actions execute immediately** the moment the turn finalizes:
  `create_task`, `update_task`, `reschedule_task`, `move_to_backlog`,
  `complete_task`, `start_task`. They render as **Done** (with the change already
  live in the app).
- **Destructive actions wait for confirmation**: `drop_task` only. It stays
  `pending` and renders as a confirm card; `applyAction` routes destructive
  applies through `uiStore.confirm()`.

This split lives in **`autoApplyActions`** ([autoApply.ts](../src/services/ai/assistant/autoApply.ts)),
called from `assistantStore.send` after the turn. The function is pure
orchestration over the action registry and never throws — a failed action is
marked `failed` so one bad change can't sink the batch. The system prompt and the
Soul preamble tell the model to act decisively and narrate in the **past tense**
for reversible work, and to frame only destructive actions as proposals.

> **Reversibility is by nature, not yet one-click.** There is no Undo button yet;
> reversible actions are reversible *by hand* (re-edit, reschedule back). A
> one-click Undo is the natural next increment.

### 3.3 Action registry (the write surface)

Every capability is an `ActionDescriptor` in
[`actions.ts`](../src/services/ai/assistant/actions.ts), keyed by
`AssistantActionType`. A descriptor bundles four things:

```
type      promptSpec   →  how the model is told to emit it (name/when/params)
          validate()   →  raw LLM params → typed params, or throw (dropped, never crashes a turn)
          describe()   →  human label for the card
          execute()    →  run against AssistantTaskStore (a minimal slice of taskStore)
          destructive  →  routes auto-apply vs confirm
```

Current actions (the **closed** `AssistantActionType` union, [types.ts:9](../src/services/ai/assistant/types.ts)):

| Action | Destructive | Notes |
|---|---|---|
| `create_task` | no | decomposes brain-dumps into 3–7 scoped tasks; can create a new category |
| `update_task` | no | title/description/category/priority/estimate — the bulk-categorize workhorse |
| `reschedule_task` | no | move to a date (`today` or `YYYY-MM-DD`) |
| `move_to_backlog` | no | unschedule |
| `complete_task` | no | mark done |
| `start_task` | no | start a focus session (auto-pauses any running one) |
| `drop_task` | **yes** | abandon — the only confirm-gated action |

`validateAction` validates a raw action and returns a `ProposedAction`
(`status: "pending"`) or `null` (unknown type / invalid params are silently dropped).

> **Scope limitation (known):** the write surface is **task-only**. The assistant
> cannot yet rename/merge categories, edit time entries, or change focus targets.
> Widening this means extending the `AssistantActionType` union + registry. The
> MCP server already proves these operations exist server-side.

### 3.4 Read tools (the agent loop)

Before answering, the model may emit `{ "lookups": [ { "tool": …, "query": … } ] }`.
Each lookup runs **deterministically in TS** (no DB call inside the loop — data is
pre-loaded into `ToolDeps`) and the results are fed back as the next turn. Tools
live in [`tools.ts`](../src/services/ai/assistant/tools.ts):

| Tool | When | Reads |
|---|---|---|
| `search_tasks` | dedup before creating | keyword scan over all tasks |
| `list_tasks` | enumerate a set for bulk ops | filter by status / category / undated |
| `get_calibration` | sizing an estimate | retrospective calibration ratio |
| `recall` | "what happened / why did this slip" | logged reflections (notes/blockers/next-actions) |

The loop runs up to `MAX_STEPS = 6`, then forces a final answer
([agentLoop.ts:14](../src/services/ai/assistant/agentLoop.ts)). Temperature is
**0.3** for proposal consistency.

### 3.5 Context assembled each turn

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

### 3.6 System prompt & the Soul

`buildAssistantSystemPrompt` ([systemPrompt.ts](../src/services/ai/assistant/systemPrompt.ts))
composes, in order:

1. **Soul block** ([soul.ts](../src/services/ai/assistant/soul.ts)) — a product
   preamble (name + the agent contract: *reversible applied immediately,
   destructive confirmed*) followed by either the user's custom `assistantSoul`
   markdown or the shipped `DEFAULT_SOUL` (a "capable operating partner" identity).
2. Optional **About-the-user** profile.
3. The **JSON output contract** (`{ reply, actions }`), action rules (act
   decisively / past tense / confirm only destructive), and the complex-request
   decomposition guidance.
4. The **action catalog** + **read-tool protocol**.
5. **Current context** (date, categories, tasks, backlog).
6. Optional **day briefing** + proactive rules, and **retrospective** facts + honesty rules.

The model must reply with a **single JSON object** and nothing else;
`parseAssistantResponse` tolerates code fences / stray prose by extracting the
outermost `{…}`, and falls back to treating the whole text as a plain reply with
no actions.

### 3.7 State & persistence

`assistantStore` (Zustand) holds `messages`, `status` (`idle`/`thinking`/`error`),
live `steps`, and session-cached `insights`/`history`. Messages persist via
`assistantMessageRepository` (last `HISTORY_LIMIT = 40` restored on launch).
**Restored pending proposals are downgraded to `dismissed`** — they reference a
day state that may have changed, so they are shown as handled, not actionable
(`restoreHistoryActions`).

### 3.8 UI components (`src/components/assistant/`)

`AssistantPanel` (Radix dialog, framer-motion slide-in) → `BriefingBanner`
(deterministic day glance) + `MessageList` → `MessageBubble` → `ActionCard` /
`CreateTaskCard` + `ActionStatusBadge` (Done / Failed / Dismissed); `Composer`
for input; `EmptyState` for first-run prompts.

### 3.9 Self-curated memory (the learning loop)

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
no FTS5). **Next pillars:** learned skills + cross-session conversation recall.

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
| `dailyFocusTargetMinutes` | drives the day briefing / overcommit logic (default 240) |
| `debriefAutoEnabled` / `debriefAutoTime` | auto-debrief schedule (default off, 23:00) |

Edited in **Settings → AI** (`src/components/settings/SettingsPage.tsx`).

---

## 8. Invariants & design principles

1. **Deterministic math, narrated by the LLM.** Every number (calibration,
   briefing, stats) is computed in TS. The model never sees raw rows to total.
2. **Additive insight.** With no history, the retrospective block is omitted and
   behavior is unchanged.
3. **Agent autonomy is reversibility-based, not user-configured.** Reversible →
   act; destructive → confirm. The agent decides; the user never sets it up.
4. **Validation at the boundary.** Bad LLM actions/lookups are dropped, never
   thrown — one malformed item can't sink a turn.
5. **Pure cores, thin impure edges.** Request-builders, parsers, the action
   registry, retrospective math, and `autoApply` are pure and injectable;
   DB/network live at named seams (`chatClient`, `loadHistory`, `*Repository`).
6. **Many small files.** One concern per file; registries make capabilities additive.

---

## 9. Extension points

**Add an assistant action (write capability):**
1. Add the name to `AssistantActionType` ([types.ts](../src/services/ai/assistant/types.ts)).
2. Add an `ActionDescriptor` to `ACTION_REGISTRY` ([actions.ts](../src/services/ai/assistant/actions.ts))
   with `promptSpec`, `validate`, `describe`, `execute`, and the right `destructive` flag.
3. If it needs a new store op, extend `AssistantTaskStore` (and the real `taskStore`).
4. The system prompt, auto-apply routing, and card rendering pick it up automatically.

**Add a read tool:** add an entry to `TOOL_REGISTRY` ([tools.ts](../src/services/ai/assistant/tools.ts))
— it surfaces in the prompt catalog and the loop dispatcher automatically.

**Add an MCP tool:** `defineTool(...)` + register in `mcp/src/tools/index.ts` (mark `writes: true`, honest annotations).

---

## 10. Testing & verification

- **Unit:** `vitest` covers providers, the action registry, `autoApply`, the agent
  loop, response parsing, the system prompt, the soul, day briefing, recall, and
  the whole retrospective layer (93 tests in `src/services/ai/assistant/` alone).
  The MCP server has its own suite under `mcp/test/`.
- **Network/DB are injected** (`AgentLoopDeps.generateChat`, `AssistantTaskStore`,
  `ToolDeps`), so the loop and actions are tested without a provider or a database.
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
    types.ts              AssistantActionType, ProposedAction, AssistantContext, store iface
    contextBuilder.ts     taskStore snapshot → AssistantContext
    soul.ts               product preamble + DEFAULT_SOUL + buildSoulBlock
    systemPrompt.ts       full system prompt composition
    actions.ts            ACTION_REGISTRY (the write surface) + validateAction
    tools.ts              TOOL_REGISTRY (read tools) + executeLookup
    agentLoop.ts          lookup-loop orchestration (MAX_STEPS)
    assistantRunner.ts    thin entry → runAgentLoop
    responseParser.ts     parseAssistantResponse / parseLoopStep
    autoApply.ts          reversible→apply, destructive→confirm  ← execution model
    dayBriefing.ts        deterministic day-load snapshot
    recallHistory.ts      reflections window for the recall tool
    briefingSummary.ts    briefing → banner copy

src/services/retrospect/   calibration / slips / weeklyReview / loadHistory / index (pure)
src/stores/assistantStore.ts   orchestration + persistence + auto-apply wiring
src/components/assistant/      panel, message list, action cards, composer, briefing
mcp/                           external MCP server (read + manage yolo.db)
```
