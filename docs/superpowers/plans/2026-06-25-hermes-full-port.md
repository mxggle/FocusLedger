# Hermes Full Port — L2 PTC + L3 Skills + Clarify + Cross-session Recall

**Goal:** Bring Yolo's in-app assistant to full **Hermes Agent** parity by adding the
core Hermes capabilities it still lacks, on top of the already-ported L1 tool loop,
Soul, memory, and streaming. Make it *behave* like Hermes: it composes tools in code,
learns reusable skills from experience and recalls them, asks before guessing, and
remembers across sessions.

**Non-goals (Hermes parts that do NOT map to an in-app task assistant):** multi-platform
gateways (Telegram/Discord/Slack), VPS/Docker/SSH terminal backends, infra subagent
spawning. These are irrelevant to Yolo and explicitly out of scope.

**Do NOT regress:** the L1 tool registry, permission levels (plan/ask/auto), undo/revert,
self-curated memory, streaming, and the 350+ passing tests. "Full copy" means *adding*
Hermes core, never deleting already-faithful ports.

## Reference (authoritative)
- Hermes Agent: https://github.com/NousResearch/hermes-agent (MIT). Relevant modules:
  `code_execution_tool.py` (PTC), `skill_manager_tool.py` (skills), `clarify_tool.py`,
  `registry.py`, the learning loop / `_MEMORY_REVIEW_PROMPT`.
- Current architecture: `docs/ai-architecture.md`.
- L1 contracts: `docs/superpowers/specs/2026-06-23-assistant-tool-calling-agent-L1-design.md`.

## Invariants (must hold)
- Deterministic math in TS, narrated by the LLM.
- Validation at the boundary: bad tool calls / bad code → error results fed back, never thrown.
- Permission gating still applies: **writes invoked from PTC code respect plan/ask/auto and
  destructive-always-confirms** exactly like direct tool calls; undo records still produced.
- Pure cores, thin impure edges; many small files (one concern per file).
- Additive: with no skills / no special input, the prompt and behavior are unchanged.
- BYO-key, no Yolo-hosted inference. New runtime dep allowed: `quickjs-emscripten` (L2 only).

---

## Phase A — Clarify tool (owner: orchestrator)

Hermes asks instead of guessing. Add a `clarify` read-category tool.

- New file `src/services/ai/assistant/agentTools/clarify.ts`: `AgentTool` named `clarify`,
  category `read`, non-destructive. Params: `{ question: string; options?: string[] }`.
  `execute` returns `{ ok: true, summary, data: { question, options } }` — it does not touch
  the store; it is a signal.
- Loop integration (`toolLoop.ts`): when a `clarify` call appears, the loop ends the turn
  immediately and surfaces the question as the reply (and structured data for UI chips),
  rather than continuing to step. No write side effects.
- Register in `registry.ts` + add native param schema. Prompt hint in `systemPrompt.ts`:
  "When a request is ambiguous or under-specified, call `clarify` with one focused question
  instead of guessing."
- Tests: `clarify.test.ts` (tool returns question) and a `toolLoop` test (a clarify call
  terminates the turn with the question as reply, executes no writes).

---

## Phase B — L2 Programmatic Tool Calling (PTC) (owner: subagent `ptc-engineer`)

The signature Hermes capability: instead of one JSON tool call per step, the model writes a
small JS program that calls tools as functions, loops/branches, and returns a result. This is
what makes "delay every task by 30 min", "rebalance my afternoon", etc. work in one shot.

**Deliverable: self-contained, fully unit-tested modules under
`src/services/ai/assistant/ptc/`. Do NOT wire into the live loop/registry — the orchestrator
integrates.** Export clean interfaces.

- `yarn add quickjs-emscripten`. Use the **async** variant (`newQuickJSAsyncWASMModule` /
  `QuickJSAsyncContext`) because tool `execute()` is async — host functions must be awaitable.
- `ptc/sandbox.ts` — `runProgram(code, { tools, signal, timeoutMs, maxCalls })`:
  - Boots an async QuickJS context. Exposes each provided tool as an async global JS function
    (e.g. `await list_tasks({scope:"today"})`) plus a `log()` capturing output and a `result`
    return value. Marshals args/results as JSON across the boundary.
  - Enforces a wall-clock deadline via `shouldInterrupt`, a max tool-call count, and honors
    `AbortSignal`. No network, no filesystem, no `globalThis` host access inside the sandbox.
  - Returns `{ ok, returnValue, logs, toolCalls: {name,args,result}[], error? }`. Never throws
    to the caller for in-sandbox errors — captures them as `{ ok:false, error }`.
- `ptc/toolBridge.ts` — turns the `AgentTool[]` registry + `AgentToolDeps` into the set of
  host functions the sandbox calls. Each call: zod-validate args; for **writes**, route through
  the SAME permission gate (`needsConfirm`) and undo-recording path the JSON loop uses — return
  a "queued for confirmation" sentinel when deferred so the program can continue. Reads execute
  directly. Collect `ToolCallRecord`s.
- `ptc/types.ts` — `PtcResult`, `PtcOptions`, `HostTool`.
- Tests (`ptc/sandbox.test.ts`, `ptc/toolBridge.test.ts`): a program that calls a read tool and
  returns a value; a program that loops over fake tasks calling a write tool N times; timeout
  fires; abort mid-run; bad code → captured error not throw; max-calls cap; write gating defers
  in `plan`/`ask`. Use injected fake tools (no real store, no network).

Orchestrator integration (after subagent returns): add an `execute_program` (or `run` ) tool —
category special — whose `execute` runs `runProgram` with the live registry/deps, threads
`signal`, and folds produced `ToolCallRecord`s into the loop's `records`. Update `systemPrompt`
to teach the program form and when to prefer it (multi-step / bulk / conditional work) over
single JSON calls. Keep single JSON tool calls as the simple path.

---

## Phase C — L3 Skills / learning loop (owner: subagent `skills-engineer`)

Hermes creates reusable skills from experience and recalls them. Build procedural memory that
rides on the existing memory infra patterns.

**Deliverable: self-contained, fully unit-tested modules under
`src/services/ai/assistant/skills/`. Do NOT wire DB/store — orchestrator integrates.**

- `skills/types.ts` — `AssistantSkill { id, name, trigger, steps (markdown / PTC snippet),
  createdAt, updatedAt, useCount, lastUsedAt, pinned, archived }`. `SkillOp` (create/update/
  archive) mirroring the memory `MemoryOp` shape.
- `skills/extract.ts` — pure: given a settled transcript + executed tool records, produce a
  `SkillOp[]` proposal (parser over an LLM JSON reply; invalid dropped — mirror
  `memory/reviewParser.ts`). Plus `skills/extractPrompt.ts` (the extraction prompt, porting
  Hermes skill-creation intent: name, trigger, reusable steps).
- `skills/gate.ts` — `shouldExtractSkill(turn)`: only after a genuinely multi-step/novel task
  (≥2 tool calls or PTC), skip trivial turns. Mirror `memory/reviewGate.ts`.
- `skills/rank.ts` — pure: rank active skills against the user's message, top-K (deterministic
  TS, like `rankMemories`). `skills/render.ts` — render top skills into a prompt block
  ("Learned skills you can reuse:") — additive, empty when none.
- `skills/applyOps.ts` — fold `SkillOp[]` (dedup by name, usage bump, contradiction→update,
  pinned protected, **archive-not-delete**). Mirror `memory/applyOps.ts`.
- Tests for each pure core, mirroring the memory test suite.

Orchestrator integration (after subagent returns): `src/db/assistantSkillRepository.ts` +
`assistant_skills` table (migration), session-cached load in `assistantStore` (like memories),
inject ranked skills into `AssistantContext`/`systemPrompt`, and a debounced post-turn
`runSkillReview` (fire-and-forget, gated, one aux LLM call) — mirroring `runMemoryReview`.
Optional `SkillManager` viewer in Settings → AI (list / pin / archive / restore).

---

## Phase D — Cross-session recall (owner: orchestrator, if time)

Hermes does FTS5 session search + LLM summarization for cross-session recall. Yolo's `recall`
tool currently reads reflections only. Extend `recall` (or add `recall_sessions`) to search
prior assistant conversations (already persisted via `assistantMessageRepository`) and return a
deterministic ranked snippet set the model narrates. No embeddings; keyword rank in TS.

---

## Execution protocol
- TDD per the repo norm: failing test → implement → green → commit. One logical change per commit.
- Stage only files you changed; never `git add -A`. Leave the unrelated `vite.config.*` edits alone.
- `yarn test` + `yarn build` green after each phase. Baseline is green (exit 0) as of start.
- Subagents deliver isolated, tested modules with NO live wiring; the orchestrator owns all edits
  to shared files (`registry.ts`, `toolLoop.ts`, `systemPrompt.ts`, `assistantStore.ts`, DB) to
  avoid conflicts and keep regressions controllable.
