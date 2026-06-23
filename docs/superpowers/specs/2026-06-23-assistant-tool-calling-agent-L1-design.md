# L1 — General tool-calling assistant (de-workflow the agent) + permission levels + session undo

**Date:** 2026-06-23
**Status:** Approved design, ready for spec review → implementation plan
**Audience:** This spec is written to be executed by a **fresh session or a different agent** with no prior context. It states the problem, the current architecture, the exact target contracts, and the test plan. Read it top to bottom; you should not need any other conversation history.

## 0. Big picture (why this exists)

Yolo is an AI-native desktop task app (Tauri v2 + React 18 + TypeScript + Vite + Tailwind; Zustand stores). Its in-app assistant lives in `src/services/ai/assistant/`. We are porting the **agent architecture of [Hermes Agent](https://github.com/NousResearch/hermes-agent)** (MIT) — a general tool-calling agent that composes capabilities rather than running a fixed workflow — into Yolo, in three phases:

- **L1 (this spec):** replace the closed, hand-coded action enum with a **general tool-calling agent** over a domain tool registry, plus **user-settable permission levels** (Plan / Ask / Auto) and **session undo (revert)**.
- **L2 (later spec):** programmatic tool calling — the agent emits a small sandboxed script that loops over tools (Hermes "PTC"). Needs a JS sandbox (`quickjs-emscripten`).
- **L3 (later spec):** skill creation — the agent saves proven solutions as reusable skills, recalled via the self-curated memory loop already shipped (see `docs/superpowers/specs/2026-06-23-assistant-self-curated-memory-design.md`).

Do **not** implement L2/L3 here. L1 must be shippable on its own.

## 1. Problem & root cause

The assistant cannot perform requests outside a closed list of 7 hand-coded "actions," and when asked for anything off-list it **fabricates a junk task** and reports success. Reproduced: user says (Chinese) "delay every task today's start by 30 minutes" → assistant creates a new task literally titled "delay all tasks by 30 minutes" and marks it Done.

Root cause (three defects, all in the assistant layer — the data layer already supports everything):

1. **Blind:** the model's task view (`ContextTask`) omits `planned_start_time`/`planned_end_time`. It can't see schedule times.
2. **Powerless:** the only write surface is the closed `AssistantActionType` union (`create_task`, `update_task` [title/desc/category/priority/estimate only], `reschedule_task` [day only — and it *nulls* the start time], `move_to_backlog`, `drop_task`, `complete_task`, `start_task`). No way to set a start time, even though `taskStore.updateTask` and `UpdateTaskInput` fully support `planned_start_time`/`planned_end_time`.
3. **Dishonest fallback:** the system prompt says "act decisively" and "decompose brain-dumps into `create_task`," with no rule to admit "I can't." So unsupported intents degrade into a `create_task` titled with the user's sentence, which (being reversible) auto-applies and renders "Done."

L1 fixes the **class** of problem, not the one phrasing: a general tool surface + an honesty rule + safe undo.

## 2. Current architecture (so you can navigate)

Pipeline: `assistantStore.send()` → `runAssistantTurnStreaming()` (`assistant/assistantRunner.ts`) → `runAgentLoop` machinery (`assistant/agentLoop.ts`) → `parseAssistantResponse`/`parseLoopStep` (`assistant/responseParser.ts`) → `autoApplyActions` (`assistant/autoApply.ts`) → UI cards.

Key current files (all under `src/services/ai/assistant/` unless noted):
- `types.ts` — `AssistantActionType` union, `ProposedAction`, `AssistantContext`, `ContextTask`, `ChatMessage`, `AssistantTaskStore` (minimal store slice).
- `actions.ts` — `ACTION_REGISTRY` (the 7 write actions; each has `promptSpec`/`validate`/`describe`/`execute`/`destructive`), `validateAction`.
- `tools.ts` — `TOOL_REGISTRY` of **read** lookups (`search_tasks`, `get_calibration`, `recall`, `list_tasks`) + `executeLookup`, `toolCatalog`.
- `agentLoop.ts` — the loop: model emits `{ lookups:[{tool,query}] }` (read) or a final markdown+fenced-json answer; `MAX_STEPS = 6`; `ASSISTANT_TEMPERATURE = 0.3`.
- `assistantRunner.ts` — `runAssistantTurnStreaming` (streaming variant; classifies each turn as buffered-JSON vs live-markdown).
- `responseParser.ts` — `parseLoopStep` (lookups vs final), `parseAssistantResponse` (markdown reply + trailing fenced `json` actions array → `ProposedAction[]` via `validateAction`).
- `autoApply.ts` — `autoApplyActions`: reversible actions execute immediately; destructive (`drop_task`) left pending.
- `systemPrompt.ts` — `buildAssistantSystemPrompt(ctx)`: soul + profile + learned-memory block + action contract + action catalog (`actionPromptSpecs`) + read-tool protocol (`toolCatalog`) + context + briefing + retro.
- `contextBuilder.ts` — maps a `taskStore` snapshot → `AssistantContext`.
- `memory/*` + `src/db/assistantMemoryRepository.ts` — shipped self-curated memory (keep working; see §11).

Store: `src/stores/assistantStore.ts` — `send`, `runStreamFrom` (the streaming orchestration), `applyAction`/`applyAll`/`dismissAction`, message persistence, memory pre/post hooks.
UI: `src/components/assistant/` — `AssistantPanel`, `MessageList`, `MessageRow`, `ActionCard`, `ActionStatusBadge`, `CreateTaskCard`, `Composer`, etc.
Store of truth for the general tool semantics to mirror: the MCP server `mcp/src/tools/*` (`listTasks`, `getTask`, `updateTask` [general], `addTask`, `startTask`, `pauseTask`, `completeTask`, `dropTask`, `listCategories`, `listTimeEntries`, `dailySummary`). It runs as a separate `better-sqlite3` process; you **mirror its contracts in-app**, executing via `taskStore` — you do not import it.

`taskStore` (`src/stores/taskStore.ts`) already exposes everything writes/undo need: `createTask(CreateTaskInput)`, `updateTask(id, UpdateTaskInput)` (any field incl. `planned_start_time`/`planned_end_time`/`status`), `deleteTask(id)`, `startTask(id)`, `pauseActiveTask()`, `completeTask(id, note?)`, `dropTask(id)`, `moveTaskToBacklog(id)`, `ensureCategory(name)`, `refresh()`. State getters: `useTaskStore.getState().allTasks`, `.categories`.

`Task` (`src/types/task.ts`) fields incl. `planned_start_time: string|null` ("HH:mm", 24h), `planned_end_time`, `status` (`todo|doing|paused|done|dropped`), `due_date`, `category_id`, `priority`, `estimated_minutes`. `UpdateTaskInput` is `Partial<Pick<Task, …>>` and accepts all of them.

## 3. Target design (L1)

### 3.1 Tool registry — one general surface (`src/services/ai/assistant/agentTools/`)

Replace **both** `actions.ts` and `tools.ts` with a single registry of `AgentTool`s.

```ts
// agentTools/types.ts
import { z } from "zod"; // NOTE: zod is NOT yet a dependency — add it (see §9).
import type { Task, CreateTaskInput, UpdateTaskInput } from "../../../../types";
import type { AssistantContext } from "../types";
import type { RetrospectiveInsights } from "../../../retrospect/types";
import type { RecallEntry } from "../recallHistory";

export type ToolCategory = "read" | "write";

/** Snapshot of a task's mutable fields, captured BEFORE a write, for undo. */
export type TaskUndoSnapshot = Pick<
  Task,
  | "title" | "description" | "category_id" | "priority" | "estimated_minutes"
  | "due_date" | "planned_start_time" | "planned_end_time" | "status" | "updated_at"
>;

export type UndoOp =
  | { kind: "delete_task"; taskId: string }                              // inverse of create
  | { kind: "restore_task"; taskId: string; before: TaskUndoSnapshot };  // inverse of update/status/drop

export type ToolResult =
  | { ok: true; summary: string; data?: unknown; undo?: UndoOp }
  | { ok: false; error: string };

export interface AgentTaskStore {
  getAllTasks(): Task[];
  getCategories(): { id: string; name: string }[];
  createTask(input: CreateTaskInput): Promise<{ ok: boolean; id?: string; message?: string }>;
  updateTask(id: string, input: UpdateTaskInput): Promise<{ ok: boolean; message?: string }>;
  deleteTask(id: string): Promise<{ ok: boolean; message?: string }>;
  startTask(id: string): Promise<"started" | "failed">;
  pauseActiveTask(): Promise<{ ok: boolean; message?: string }>;
  completeTask(id: string, note?: string): Promise<{ ok: boolean; message?: string }>;
  dropTask(id: string): Promise<{ ok: boolean; message?: string }>;
  moveTaskToBacklog(id: string): Promise<{ ok: boolean; message?: string }>;
  ensureCategory(name: string): Promise<string>;
  refresh(): Promise<void>;
}

export type AgentToolDeps = {
  store: AgentTaskStore;
  ctx: AssistantContext;                 // today, categories, id refs (resolution/validation)
  insights: RetrospectiveInsights | null;
  history: RecallEntry[];
  now: () => string;                     // ISO timestamp factory (injectable for tests)
};

export type AgentTool = {
  name: string;
  category: ToolCategory;
  destructive: boolean;
  description: string;                   // prompt text: when + how to use
  parameters: z.ZodType<unknown>;        // arg schema; rendered to the prompt + validated by the loop
  execute: (args: unknown, deps: AgentToolDeps) => Promise<ToolResult>;
};
```

`AgentTaskStore` is a structural interface. Provide a thin adapter (`agentTools/storeAdapter.ts`) that implements it from `useTaskStore.getState()` (getters read live `allTasks`/`categories`; writes call the store methods; `getAllTasks` is re-read live so the agent sees its own changes across loop steps). The real `taskStore` is **not** modified.

> **Created-id capture (required for `create_task` undo):** `taskStore.createTask` returns a `MutationResult` that may not include the new task id. The adapter's `createTask` MUST surface the id — use the store's return value if it carries one, otherwise diff `getAllTasks()` before/after the call (the new row is the one absent before). Without the id, `create_task` cannot build its `delete_task` undo.

### 3.2 Tool list (concrete)

Registry in `agentTools/registry.ts` exporting `AGENT_TOOLS: AgentTool[]` + helpers `toolByName(name)`, `renderToolCatalog()` (name + description + JSON-schema-ish params for the prompt; derive param text from the zod schema or a hand-written `paramsHint` string per tool — a `paramsHint` field is simplest and explicit).

**Read tools** (`category: "read"`, `destructive: false`, no `undo`):
- `list_tasks` — args `{ scope?: "today"|"backlog"|"all"; status?: TaskStatus; category?: string; undated?: boolean }`. Returns matching tasks **including** `planned_start_time`/`planned_end_time`, status, due_date, category. Default scope `today`.
- `get_task` — `{ task_id }` → full task incl. times.
- `search_tasks` — `{ query }` → keyword scan over all tasks (port from current `tools.ts`).
- `list_categories` — `{}`.
- `get_calibration` — `{ category? }` → retrospective ratio (port from current `tools.ts`).
- `recall` — `{ query }` → logged reflections (port from current `tools.ts`).
- `daily_summary` — `{ scope?: "today"|YYYY-MM-DD }` → deterministic day stats (reuse `dayBriefing.ts`/retrospect; numbers computed in TS).

**Write tools — reversible** (`destructive: false`; each returns `undo`):
- `create_task` — `{ title, description?, category?, priority?, estimated_minutes?, due_date?, planned_start_time?, planned_end_time? }`. `category` resolves to existing id or creates via `ensureCategory`. `due_date` accepts `"today"`|`YYYY-MM-DD`. `planned_*` are `"HH:mm"`. `undo = { kind:"delete_task", taskId }`.
- `update_task` — `{ task_id, ...any subset of: title, description, category, priority, estimated_minutes, due_date, planned_start_time, planned_end_time, status }`. **This is the keystone** — it makes "shift starts," "recategorize," "re-estimate," etc. all expressible. Capture `before` snapshot, then `store.updateTask`. `undo = { kind:"restore_task", taskId, before }`.
- `start_task` — `{ task_id }`. `undo` restores prior `status` (and the auto-paused task is a known limitation — note it; do not attempt to undo the auto-pause in v1).
- `pause_task` — `{}` (maps to `pauseActiveTask`; pauses the running focus). `undo` = restore prior status of the affected task.
- `complete_task` — `{ task_id, note? }`. `undo` restores prior `status`.
- `move_to_backlog` — `{ task_id }`. `undo` restores prior `due_date`.

**Write tool — destructive** (`destructive: true`):
- `drop_task` — `{ task_id }`. `undo` restores prior `status`.

All write tools resolve/validate `task_id` against `ctx` known tasks; invalid id → `{ ok:false, error }` (fed back to the model so it can correct).

### 3.3 The loop (`agentLoop.ts` rewrite)

Protocol (provider-agnostic JSON, evolves today's `{lookups}` pattern — **no provider changes**):
- The model replies with **either** a JSON object `{ "tool_calls": [ { "name": "...", "args": {...} }, ... ] }` **or** a final Markdown answer.
- Classification reuses today's rule: first non-whitespace char `{` → parse as tool-call JSON; else → final Markdown.
- For each tool call: look up the tool; `parameters.safeParse(args)`; on failure feed back `"<name>: invalid args — <zod message>"`. On success branch by §3.4.
- Feed results back as a user turn: `Tool results:\n<name>: <summary|data|error>` (one line per call) + `Continue, or give your final answer.`
- Loop until a final Markdown answer or `MAX_STEPS = 12` (raise from 6 — composition needs more rounds). On budget exhaustion, force a final answer (as today).
- Keep streaming support (`assistantRunner.ts`): tool-call JSON turns are buffered (not shown); final Markdown streams live. Same classification machinery as today.

### 3.4 Permission levels (Plan / Ask / Auto)

New setting `assistantPermissionLevel: "plan" | "ask" | "auto"` (default `"auto"`). The loop calls `needsConfirm(tool, level)` for each **write** call (reads always execute):

| level | read tools | reversible writes | destructive writes | agent framing in prompt |
|---|---|---|---|---|
| **plan** | execute | **defer** (propose) | **defer** (propose) | "Do not act. Produce a plan; your proposed changes are shown for approval." |
| **ask** | execute | **defer** (propose) | **defer** (propose) | "Every change is confirmed by the user before it applies." |
| **auto** (default) | execute | **execute in-loop** | **defer** (confirm) | "Reversible changes apply immediately; destructive ones are confirmed." |

```ts
function needsConfirm(tool: AgentTool, level: PermissionLevel): boolean {
  if (tool.category === "read") return false;
  if (level === "auto") return tool.destructive;
  return true; // plan + ask defer all writes
}
```

- **Defer** = do **not** execute; record the call as a `pending` `ToolCallRecord` (renders as a confirm card) and feed back to the model: `"<name>: queued for the user's confirmation (not applied yet)"`. The model finalizes its message around that.
- **Execute in-loop** = run `tool.execute`, capture `undo`, feed back the real `summary`, mark the record `executed`.
- Plan vs Ask are mechanically identical (defer all writes); they differ only in prompt framing (Plan tells the agent to present a plan and await go-ahead; Ask lets it propose changes per card). The UI primary button differs: Plan shows "Run plan" (apply all), Ask shows per-card Apply + "Apply all."

Applying a pending card later runs the same `tool.execute` (capturing `undo` at apply time) via the store. This unifies in-loop execution and card-apply through one code path.

### 3.5 Session undo (revert)

Every executed write carries an `undo: UndoOp` on its `ToolCallRecord`. UI exposes **Revert** per executed write card and **"Undo these changes"** per assistant turn (reverts that turn's executed writes in reverse order).

```ts
async function revertToolCall(rec: ToolCallRecord, store: AgentTaskStore): Promise<{ ok: boolean; message?: string }> {
  if (rec.status !== "executed" || !rec.undo) return { ok: false, message: "Nothing to revert" };
  // drift check: if the target task was changed since this action, warn before clobbering.
  if (rec.undo.kind === "delete_task") return store.deleteTask(rec.undo.taskId);
  // restore_task: write back the captured fields (incl. status)
  return store.updateTask(rec.undo.taskId, { ...rec.undo.before });
}
```

- Drift detection: `restore_task` compares the current task's `updated_at` against the value the record expects (the `updated_at` right after the action). If they differ, the task was edited since → the UI asks "changed since — revert anyway?" before applying. If the task no longer exists → report "can't revert (task was deleted)."
- After revert, set `status: "reverted"`, call `store.refresh()`, re-render the card.
- Scope is the chat session, but because messages + their `toolCalls` persist (see §3.7), revert works for any past turn still in the conversation.

### 3.6 System prompt changes (`systemPrompt.ts`)

- Replace the action catalog + read-tool protocol with **one tool catalog** from `renderToolCatalog()` (every tool: name, description, params).
- Replace the JSON output contract with the tool-call protocol (§3.3).
- **Remove** the "decompose brain-dumps into create_task" catch-all framing.
- **Add the honesty rule:** *"`create_task` is ONLY for genuinely new work the user wants tracked. If a request cannot be done with the available tools, say so plainly and suggest the closest supported action — never invent a task to fake completion."*
- Add the permission-mode line from §3.4 based on the current level.
- Keep: soul block, About-the-user profile, learned-memory block, current context (now including times — see §3.8), briefing, retrospective + their honesty rules.

### 3.7 Data model, UI, persistence

```ts
export type ToolCallStatus = "executed" | "pending" | "failed" | "reverted" | "dismissed";
export type ToolCallRecord = {
  id: string;
  name: string;
  args: unknown;
  category: ToolCategory;
  destructive: boolean;
  summary: string;          // human label, e.g. 'Shifted "Write report" start to 09:30'
  status: ToolCallStatus;
  result?: string;
  error?: string;
  undo?: UndoOp;            // present once executed
};
```

- `ChatMessage` (in `types.ts`) gains `toolCalls?: ToolCallRecord[]` **alongside** the legacy `actions?: ProposedAction[]`. New turns populate `toolCalls`; historical messages keep `actions`.
- **Back-compat:** the UI renders `toolCalls` when present, else falls back to the legacy `actions` rendering. Do not migrate old rows.
- `ContextTask` gains `plannedStartTime: string|null` and `plannedEndTime: string|null`; `contextBuilder.ts` populates them; the prompt's task list renders times (e.g. `- [id] "title" (todo, high, 09:00–10:00, est 60m)`). This is the **perception** fix.
- UI (`src/components/assistant/`):
  - `PermissionSwitcher` in `AssistantPanel` header — segmented Plan / Ask / Auto bound to `assistantPermissionLevel`.
  - Write tool calls render via `ActionCard`/`ActionStatusBadge`: `pending` → Apply (+ turn "Apply all"/"Run plan"); `executed` reversible → **Revert**; `failed` → error; `reverted`/`dismissed` → badge.
  - Read tool calls render as the existing live "steps."
  - Turn-level "Undo these changes" when the turn has ≥1 executed reversible write.

### 3.8 Store wiring (`assistantStore.ts`)

- Build `AgentToolDeps` (store adapter + ctx + insights + history + `now`) and pass the permission level into the loop.
- In-loop executed writes update the streaming message's `toolCalls`; after the turn, `taskStore.refresh()` if any executed.
- `applyAction`/`applyAll` become `applyToolCall`/`applyAll` (run a pending tool call's `execute`, capture undo, mark executed); add `revertToolCall`/`revertTurn`; keep `dismiss`.
- Memory hooks unchanged (post-turn `runMemoryReview` still uses last user text + final reply — see §11).

## 4. What gets removed/absorbed (only after the new path is green)

- `actions.ts`, `tools.ts`, `autoApply.ts` → replaced by `agentTools/*` + the loop's execute/permission/undo.
- `responseParser.ts`: replace action-parsing with tool-call parsing; keep Markdown-reply extraction.
- `types.ts`: retire `AssistantActionType`; keep `ProposedAction` as a **legacy alias** used only for rendering historical messages.

## 5. Invariants (carried from the existing design)

- **Deterministic math in TS, narrated by the LLM** — `daily_summary`/`get_calibration` compute numbers in TS; the model never totals raw rows.
- **Validation at the boundary** — invalid tool calls/args are returned as error results (fed back), never thrown; one bad call can't sink a turn.
- **Graduated autonomy is now user-controlled** via permission level; destructive always confirms (even in Auto).
- **Reversibility is real** — every write is undoable in-session.
- **Additive** — with no memory/history, prompt and behavior match today minus the removed junk-creation framing.
- **Many small files** — one tool per file under `agentTools/`; registry is additive.

## 6. Out of scope (follow-on specs)

- **L2:** programmatic tool calling (sandboxed compose-by-code). Needs `quickjs-emscripten`.
- **L3:** skill creation + recall via the memory loop.
- Native provider function-calling (the internal `AgentTool` interface is designed so this can replace the JSON protocol later without touching tools).
- Consolidating tool **contracts** with `mcp/` into a shared package (DRY) — note it; don't do it here.

## 7. Testing (Vitest; mirror existing injected-deps style)

- **Per tool** (`agentTools/*.test.ts`): valid args → correct `taskStore` call + `undo` shape; invalid args/id → `{ok:false}`; `update_task` accepts `planned_start_time` and returns a `restore_task` undo with the prior snapshot.
- **Loop** (`agentLoop.test.ts`): multi-round compose (read → write → final) with injected `generateChat`; `needsConfirm` matrix (plan/ask defer all writes; auto executes reversible, defers destructive); budget exhaustion forces final.
- **Undo** (`revert.test.ts`): `restore_task` writes back prior fields; `delete_task` removes a created task; drift (changed `updated_at`) is flagged; missing task reports cleanly.
- **Prompt** (`systemPrompt.test.ts`): tool catalog lists every tool; honesty rule present; no "decompose into create_task"; permission-mode line varies by level; task list renders times.
- **Parser** (`responseParser.test.ts`): `{tool_calls:[...]}` parsed; malformed args tolerated; Markdown final still extracted.
- **Store** (`assistantStore.test.ts`): apply pending tool call executes + captures undo; revert path; memory hooks still fire.
- **Back-compat**: a historical message with legacy `actions` still renders.
- **Bug regression (the motivating case):** with the tool surface + an injected `generateChat` that emits `list_tasks` then `update_task(planned_start_time)` per task, the loop executes real updates (no `create_task`); and an unsupported request yields an honest reply with **zero** `create_task` calls.
- Verify: `yarn test` + `yarn build` (tsc + vite). No Rust changes.

## 8. File map

**Create:** `src/services/ai/assistant/agentTools/` → `types.ts`, `registry.ts`, `storeAdapter.ts`, one file per tool (`listTasks.ts`, `getTask.ts`, `searchTasks.ts`, `listCategories.ts`, `getCalibration.ts`, `recall.ts`, `dailySummary.ts`, `createTask.ts`, `updateTask.ts`, `startTask.ts`, `pauseTask.ts`, `completeTask.ts`, `moveToBacklog.ts`, `dropTask.ts`), `revert.ts`, `permissions.ts` (`needsConfirm`, `PermissionLevel`), + `*.test.ts`. `src/components/assistant/PermissionSwitcher.tsx` (+ test).
**Modify:** `agentLoop.ts`, `assistantRunner.ts`, `responseParser.ts`, `systemPrompt.ts`, `contextBuilder.ts`, `types.ts` (`ContextTask` times, `ChatMessage.toolCalls`, retire `AssistantActionType`), `assistantStore.ts`, `src/types/settings.ts` (`assistantPermissionLevel`), `src/components/settings/SettingsPage.tsx` (permission setting), assistant UI components (render `toolCalls`, Revert), `docs/ai-architecture.md`.
**Remove (after green):** `actions.ts`, `tools.ts`, `autoApply.ts` (and their tests), legacy action-parsing.
**Dependency:** add `zod` (runtime) for tool arg schemas.

## 9. Verification commands

```bash
yarn test         # vitest run — all suites green
yarn build        # tsc -b && vite build — type-check + bundle
```
