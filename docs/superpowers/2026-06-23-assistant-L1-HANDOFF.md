# HANDOFF — L1 General Tool-Calling Assistant (Yolo)

**For:** an autonomous coding agent (or engineer) picking this up cold.
**Date:** 2026-06-23 · **Repo:** Yolo (Tauri v2 + React 18 + TS + Vite + Tailwind; Zustand) · **Branch base:** `feat/ai-features`

---

## 1. Mission (one paragraph)

Yolo's in-app AI assistant currently uses a **closed, hand-coded enum of 7 "actions."** Anything off-list fails — and worse, it **fabricates a junk task and reports success** (e.g. asked to "delay every task's start by 30 min," it creates a task literally titled that and marks it Done). Replace this fixed workflow with a **general tool-calling agent** (Hermes-style): a registry of composable read/write tools the model calls in a loop, so novel requests work by composition without new hardcoded actions. Also add **user-settable permission levels (Plan / Ask / Auto)** and **session undo (revert)**. This is **L1** of a 3-phase port; build L1 only.

## 2. Read these first (authoritative — do not re-derive)

1. **Design spec:** [`docs/superpowers/specs/2026-06-23-assistant-tool-calling-agent-L1-design.md`](specs/2026-06-23-assistant-tool-calling-agent-L1-design.md)
   — problem, root cause, current-architecture file map, exact target contracts (`AgentTool`, `AgentTaskStore`, `UndoOp`, `ToolCallRecord`), permission table, undo design, test plan. **Self-contained; you do not need any chat history.**
2. **Implementation plan:** [`docs/superpowers/plans/2026-06-23-assistant-tool-calling-agent-L1.md`](plans/2026-06-23-assistant-tool-calling-agent-L1.md)
   — 16 TDD-ordered tasks in 6 phases, each with real test code, exact commands, and a commit. **Execute tasks in order.**

Background (optional context, not required to build L1):
- [`docs/ai-architecture.md`](../ai-architecture.md) — how the AI layer works today.
- Hermes Agent (the architecture being ported): https://github.com/NousResearch/hermes-agent — relevant tools: `code_execution_tool.py` (L2, later), `skill_manager_tool.py` (L3, later), `registry.py`, `clarify_tool.py`.

## 3. Environment & baseline

```bash
# from repo root
yarn install
yarn test     # vitest run — MUST be green before you start (baseline ~56 files / ~353 tests)
yarn build    # tsc -b && vite build — MUST be green before you start
```
- No Rust changes are needed for L1 (`cargo check` not required).
- New dependency you will add in Task 1: `zod` (`yarn add zod`).
- **BYO-key:** there is no Yolo-hosted inference. Do not add any inference service; reuse the existing provider layer (`src/services/ai/providers.ts`, `chatClient.ts`). The tool-calling protocol is plain JSON over the existing chat call — **no provider changes**.

## 4. Important context & gotchas

- **In-flight WIP:** `feat/ai-features` carries an assistant-modernization WIP that was checkpointed at commit `7245f4c` ("wip: assistant modernization — streaming + modern chat UX"), and a just-shipped **self-curated memory** feature (`src/services/ai/assistant/memory/`, `src/db/assistantMemoryRepository.ts`). **Do not regress either.** The memory post-turn review hook must keep working (it consumes the final assistant reply — unaffected by tool calls).
- **Recommended isolation:** L1 is a large change. Do it in a dedicated git worktree/branch off `feat/ai-features` (e.g. `feat/agent-tool-calling`) so it stays isolated until reviewed. (Use the `superpowers:using-git-worktrees` skill if available.)
- **Data layer already supports everything.** `taskStore` (`src/stores/taskStore.ts`) exposes `createTask`, `updateTask` (any field incl. `planned_start_time`/`planned_end_time`/`status`), `deleteTask`, `startTask`, `pauseActiveTask`, `completeTask`, `dropTask`, `moveTaskToBacklog`, `ensureCategory`, `refresh`. The gap was only in the assistant layer.
- **Time format:** `planned_start_time`/`planned_end_time` are `"HH:mm"` 24h strings (or null).

## 5. Execution protocol

1. Confirm the baseline is green (§3).
2. Work the plan **task by task, in order.** For each task: write the failing test → run it (see it fail) → implement → run it (see it pass) → commit with the message given in the task. (TDD; one logical change per commit.)
3. Use the **`superpowers:executing-plans`** skill (inline) or **`superpowers:subagent-driven-development`** (one subagent per task) to drive it. The plan header names these.
4. Run the **full suite + build green after each phase**, and especially before Task 15 (the legacy-removal task) and at the end.
5. If a step's reality differs from the plan (a signature changed, a file moved), prefer the **spec's contracts** as truth and adapt minimally — do not invent new scope.

## 6. Guardrails / invariants (must hold)

- **Deterministic math in TS, narrated by the LLM** — `daily_summary`/`get_calibration` compute numbers in TS; never ask the model to total raw rows.
- **Validation at the boundary** — invalid tool calls/args are returned as error results fed back to the model, never thrown; one bad call can't sink a turn.
- **Permission gating** — `needsConfirm(tool, level)`: reads always run; in `auto` reversible writes auto-apply and destructive (`drop_task`) confirms; in `plan`/`ask` all writes are deferred to confirm cards. Destructive **always** confirms.
- **Every write is reversible in-session** — each executed write records an inverse (`UndoOp`); Revert restores it (with drift detection).
- **Additive / no regressions** — historical messages (legacy `ProposedAction[]`) still render; the memory feature still works; with no special input the assistant behaves as before minus the junk-creation framing.
- **Honesty rule** — `create_task` is only for genuinely new work the user wants tracked; if a request can't be done with the tools, say so / suggest the nearest action — never fabricate a task.
- **Many small files** — one tool per file under `src/services/ai/assistant/agentTools/`.

## 7. Scope

**In scope (L1):** general tool registry (read + write), JSON tool-call loop, permission levels (Plan/Ask/Auto) + a switcher UI, session undo (revert) + UI, perception fix (schedule times in context), honesty rule, removal of the legacy action/lookup/autoApply system, docs + regression test.

**Out of scope (separate future specs — do NOT build):**
- **L2** programmatic tool calling (sandboxed compose-by-code; `quickjs-emscripten`).
- **L3** skill creation + recall via the memory loop.
- Native provider function-calling (the `AgentTool` interface is designed so this can replace the JSON protocol later).
- Sharing tool contracts with the `mcp/` server (DRY consolidation).

## 8. Definition of done

- [ ] Every task in the plan complete, each committed as specified.
- [ ] **Regression (the motivating bug):** asked to shift today's task start times by 30 min, the agent calls `list_tasks` then `update_task(planned_start_time=…)` per task — **zero `create_task`** calls — verified by the regression test in plan Task 16.
- [ ] An unsupported request yields an honest reply with **no** fabricated task.
- [ ] Permission levels work: Plan proposes only; Ask confirms every write; Auto auto-applies reversible and confirms destructive.
- [ ] Any executed write can be reverted from the chat (per-card and per-turn), with drift handled.
- [ ] Schedule times are visible to the model (rendered in the task context).
- [ ] Legacy `actions.ts` / `tools.ts` / `autoApply.ts` / old loop removed; no dangling imports.
- [ ] `yarn test` and `yarn build` green; the self-curated memory feature still passes.
- [ ] `docs/ai-architecture.md` updated to describe the tool-calling agent, permission levels, and undo.

## 9. If you get stuck

- Tests failing for an unclear reason → use the `superpowers:systematic-debugging` skill (root cause before fixes).
- A design decision seems ambiguous → the **spec** is the source of truth; if it's genuinely unspecified, pick the simplest option consistent with the invariants in §6 and note it in the commit message. Do not expand scope.
