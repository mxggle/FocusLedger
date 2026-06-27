# Yolo AI Assistant Test Plan

Date: 2026-06-23
Owner role: QA / test engineering
Scope: in-app AI assistant and adjacent AI surfaces that affect assistant behavior.

## 1. Goals

This plan has two goals:

1. Cover the current AI assistant comprehensively: provider integration, prompt/context construction, tool-calling, permissions, task mutation, undo/reapply, memory, retrospective context, UI flows, and degraded states.
2. Identify missing capabilities and product opportunities that would make Yolo more AI-native while preserving the product throughline: plan the day, run one focus, review the truth.

## 2. System Under Test

Primary paths:

- Provider layer: `src/services/ai/providers.ts`, `aiClient.ts`, `chatClient.ts`
- Assistant core: `src/services/ai/assistant/`
- Assistant store: `src/stores/assistantStore.ts`
- Assistant UI: `src/components/assistant/`
- Settings and autonomy: `src/components/settings/SettingsPage.tsx`, `src/stores/settingsStore.ts`
- Task/data integration: `src/stores/taskStore.ts`, assistant `agentTools/`
- Memory: `src/services/ai/assistant/memory/`, `src/db/assistantMemoryRepository.ts`
- Retrospective facts: `src/services/retrospect/`
- Debrief surface: `src/services/ai/debriefService.ts`, `debriefRunner.ts`

Out of scope for this document:

- External MCP server test plan, except where it informs AI-native opportunities.
- Rust shell and packaging, unless an AI flow depends on Tauri HTTP or storage.

## 3. Test Strategy

Use a layered strategy:

- Unit tests for deterministic pure logic: request builders, parsers, prompt/context, tool schemas, permissions, undo, memory gates/parsers, retrospective calculations.
- Store/integration tests for assistant state transitions: send, stop, regenerate, apply, revert, reapply, dismiss, persistence restore.
- Component tests for visible UX: composer behavior, message rows, tool cards, briefings, memory manager.
- Provider contract tests with mocked payloads for Anthropic, OpenAI, Gemini, and custom OpenAI-compatible providers.
- Manual exploratory tests for real model behavior, long-running desktop flows, and nuanced AI-native UX.
- Golden scenario evals for prompt/tool behavior: repeatable user prompts with expected tool-call patterns and forbidden outcomes.

## 4. Existing Automated Coverage Baseline

Current suites already cover important parts:

- `providers.test.ts`: provider request/response parsing, Gemini native function calls.
- `toolLoop.test.ts`: tool-call loop, native tool specs, ask/auto behavior, bulk-update regression.
- `assistantRunner.test.ts`: prompt assembly with time and retrospective context.
- `systemPrompt.test.ts`, `soul.test.ts`: prompt contract and guardrails.
- `agentTools/*.test.ts`: read/write tools, permissions, update task, revert, registry.
- `assistantStore.test.ts`, `assistantStore.applyAll.test.ts`: store send/apply/revert/reapply/persistence behavior.
- `MessageRow.test.tsx`, `Composer.test.tsx`, `ReasoningPanel.test.tsx`: core assistant UI behavior.
- `memory/*.test.ts`: memory review gate, parser, application, ranking, injection.
- `retrospect/*.test.ts`: calibration, slips, weekly review.
- `debrief*.test.ts`: debrief prompt and auto-run gating.

Gaps remain around end-to-end user journeys, real provider behavior, prompt/tool-call evals, and cross-feature AI-native acceptance.

## 5. Functional Test Matrix

### 5.1 Provider and Transport

| ID | Scenario | Expected |
|---|---|---|
| AI-PROV-01 | Anthropic chat request | System is top-level, messages mapped, default model used when unset. |
| AI-PROV-02 | OpenAI chat request | System is first message, user model override honored. |
| AI-PROV-03 | Gemini chat request | Assistant turns mapped to `model`; native `functionDeclarations` included for tools. |
| AI-PROV-04 | Custom provider with base URL | `/chat/completions` URL is built correctly. |
| AI-PROV-05 | Custom provider without base URL | User-facing configuration error. |
| AI-PROV-06 | 401/403/429/provider HTTP errors | Mapped to clear Settings/API-key/rate-limit messages. |
| AI-PROV-07 | Empty provider response | Throws controlled "empty response" error; assistant does not mutate tasks. |
| AI-PROV-08 | Gemini native functionCall payload | Converted to internal `tool_calls` JSON. |
| AI-PROV-09 | Stream request support | SSE/chunk parser extracts deltas without breaking non-stream paths. |

### 5.2 Prompt and Context

| ID | Scenario | Expected |
|---|---|---|
| AI-CTX-01 | Current selected date | Prompt treats selected date as "today". |
| AI-CTX-02 | Current local time | Prompt includes current local HH:mm and timestamp; model cannot claim it lacks current time. |
| AI-CTX-03 | Today's tasks with planned times | Prompt includes real `planned_start_time` / `planned_end_time`. |
| AI-CTX-04 | Empty day | Prompt says no tasks scheduled and includes deterministic briefing. |
| AI-CTX-05 | Backlog present | Backlog slice appears with task titles and schedule metadata. |
| AI-CTX-06 | About me profile | Prompt includes user profile only when non-empty. |
| AI-CTX-07 | Custom Soul | Custom soul replaces default body but keeps product guardrails. |
| AI-CTX-08 | Learned memories | Top memories injected; no memories keeps prompt minimal. |
| AI-CTX-09 | Retrospective facts | Calibration/slips/weekly facts injected only when data exists. |
| AI-CTX-10 | Final reply guardrails | Prompt forbids internal ids/tool names in final user replies. |

### 5.3 Tool Calling and Agent Loop

| ID | Scenario | Expected |
|---|---|---|
| AI-LOOP-01 | Read-only question | Read tools execute; no write tool cards. |
| AI-LOOP-02 | Simple write in Auto | Safe write executes, task store refreshes, Done card with undo. |
| AI-LOOP-03 | Simple write in Ask | Write queues as pending; no task mutation before Apply. |
| AI-LOOP-04 | Simple write in Plan | Write queues as pending; final answer frames proposed plan. |
| AI-LOOP-05 | Destructive write in Auto | Destructive tool queues or asks confirmation; never silently drops. |
| AI-LOOP-06 | Invalid tool name | Fed back to model as tool error; turn continues. |
| AI-LOOP-07 | Invalid args | Zod validation failure is surfaced; no mutation. |
| AI-LOOP-08 | Multi-step composition | Model can call `list_tasks` then `update_task` per result. |
| AI-LOOP-09 | MAX_STEPS exceeded | Assistant asks for final answer; no infinite loop. |
| AI-LOOP-10 | Provider throws mid-loop | Store shows error and leaves task state unchanged except completed prior tool writes. |
| AI-LOOP-11 | Bulk operation | Each task gets separate ToolCallRecord; partial failures are visible per card. |
| AI-LOOP-12 | No junk task regression | Unsupported or bulk edit requests never create placeholder tasks as fake success. |

### 5.4 Task Tool Coverage

| ID | Tool | Core Cases |
|---|---|---|
| AI-TOOL-01 | `list_tasks` | today/backlog/all, status filter, category filter, undated filter, planned times shown. |
| AI-TOOL-02 | `get_task` | Known id returns full line; unknown id returns controlled error. |
| AI-TOOL-03 | `search_tasks` | Title/description search, result cap, no-match behavior. |
| AI-TOOL-04 | `list_categories` | Empty/non-empty category list. |
| AI-TOOL-05 | `get_calibration` | Overall/category calibration, low-confidence messaging. |
| AI-TOOL-06 | `recall` | Keyword match, date/note grounding, no history behavior. |
| AI-TOOL-07 | `daily_summary` | Today/date scope, invalid scope rejection. |
| AI-TOOL-08 | `create_task` | Title, due date, backlog, category creation, planned times, undo delete. |
| AI-TOOL-09 | `update_task` | Every editable field: title, description, category, priority, estimate, due date, planned times, status. |
| AI-TOOL-10 | `start_task` | Starts known task; handles active task constraints through store. |
| AI-TOOL-11 | `pause_task` | Pauses active focus; no-active-task error. |
| AI-TOOL-12 | `complete_task` | Completes task with/without note; undo restore. |
| AI-TOOL-13 | `move_to_backlog` | Clears calendar scheduling; undo restore. |
| AI-TOOL-14 | `drop_task` | Destructive flag, confirmation, undo restore where supported. |

### 5.5 Approval, Revert, Reapply

| ID | Scenario | Expected |
|---|---|---|
| AI-ACT-01 | Pending Apply | Executes original args, refreshes store, status becomes Done. |
| AI-ACT-02 | Pending Dismiss | Status becomes Dismissed; no mutation. |
| AI-ACT-03 | Dismissed Apply | Executes original args, status becomes Done. |
| AI-ACT-04 | Done Revert | Applies undo, status becomes Reverted. |
| AI-ACT-05 | Reverted Apply | Re-executes original args, creates fresh undo, status becomes Done. |
| AI-ACT-06 | Failed Retry | Reattempts same tool call; success changes to Done, failure remains Failed with latest error. |
| AI-ACT-07 | Drift before Revert | User confirmation required before restoring old snapshot. |
| AI-ACT-08 | Revert create_task | Deletes created task; reapply creates a new task and fresh undo id. |
| AI-ACT-09 | Historical pending restore | Hydrated pending actions downgrade to Dismissed but remain re-applicable if user chooses. |
| AI-ACT-10 | Bulk action controls | Each card can be applied/reverted independently; no hidden batch coupling. |

### 5.6 UI and Interaction

| ID | Scenario | Expected |
|---|---|---|
| AI-UI-01 | Assistant opens/closes | Panel animation works; focus remains usable. |
| AI-UI-02 | Empty state prompts | Intent cards send expected prompts. |
| AI-UI-03 | Composer Enter behavior | Plan/Quick modes and keyboard hints behave as documented. |
| AI-UI-04 | Long pasted input | Input accepts multiline text; plan action visible. |
| AI-UI-05 | Thinking state | User sees step trace; no duplicate sends while running. |
| AI-UI-06 | Stop running turn | Stop suppresses incomplete assistant message and returns idle. |
| AI-UI-07 | Copy assistant reply | Copies sanitized user-facing content, not internal ids. |
| AI-UI-08 | Regenerate | Drops last assistant message and reruns from prior user turn. |
| AI-UI-09 | Edit user message | Edits user message, deletes later history, reruns. |
| AI-UI-10 | Tool card labels | Shows task titles/action labels, not raw `update_task` or ids. |
| AI-UI-11 | Tool card states | Pending/Done/Dismissed/Reverted/Failed are visually distinct and actionable. |
| AI-UI-12 | Scroll behavior | New messages scroll; scroll-to-bottom appears only when needed. |
| AI-UI-13 | Settings AI | Provider/model/key/autonomy/memory/soul/profile fields persist and affect next turn. |
| AI-UI-14 | Accessibility | Tool buttons have labels, keyboard navigation works, focus rings visible, contrast acceptable. |

### 5.7 Memory

| ID | Scenario | Expected |
|---|---|---|
| AI-MEM-01 | Memory disabled | No background memory review. |
| AI-MEM-02 | Trivial exchange | Review gate skips. |
| AI-MEM-03 | Durable fact | Adds memory with validated kind/text. |
| AI-MEM-04 | Duplicate fact | Bumps usage instead of duplicate add. |
| AI-MEM-05 | Contradiction | Updates/archive old memory according to op. |
| AI-MEM-06 | Pinned memory | Protected from archive/delete. |
| AI-MEM-07 | Invalid JSON/op | Dropped without breaking assistant turn. |
| AI-MEM-08 | Memory ranking | Relevant memories injected deterministically. |
| AI-MEM-09 | Memory manager | Edit/pin/forget/restore visible and persisted. |
| AI-MEM-10 | Aux model setting | Empty memory model reuses assistant model; explicit model override used. |

### 5.8 Retrospective and Debrief

| ID | Scenario | Expected |
|---|---|---|
| AI-RETRO-01 | No history | Prompt unchanged except normal current context; model hedges. |
| AI-RETRO-02 | Calibration overall | Ratio computed deterministically and included. |
| AI-RETRO-03 | Calibration by category | Category-specific ratio available for estimates. |
| AI-RETRO-04 | Low confidence | Prompt marks low confidence; assistant hedges. |
| AI-RETRO-05 | Slips/blockers | Old/dropped/overdue work surfaced with blocker themes. |
| AI-RETRO-06 | Weekly review | Week-over-week minutes/categories/completed/dropped injected. |
| AI-DEBRIEF-01 | Generate daily debrief | Prompt uses stats/time entries/stop notes; response saved. |
| AI-DEBRIEF-02 | Auto debrief gate | Runs once per day after configured time only when key and entries exist. |
| AI-DEBRIEF-03 | Hash unchanged | Does not regenerate unnecessarily. |
| AI-DEBRIEF-04 | Provider failure | Toast/error without breaking charts or task state. |

## 6. End-to-End Scenario Suite

These should become repeatable manual scripts first, then Playwright/Tauri E2E or AI eval scenarios.

### E2E-01: First-run No Key

Steps:

1. Clear AI key.
2. Open assistant.
3. Try to send "Plan my day".

Expected:

- Assistant explains key is needed.
- Open AI settings action works.
- No uncaught errors; no task mutation.

### E2E-02: Provider Smoke Matrix

Run the same simple prompt through Anthropic/OpenAI/Gemini/custom mock:

> "List today's tasks."

Expected:

- Provider request succeeds or controlled provider error appears.
- Gemini native tool-call path works.
- No internal ids visible in final UI.

### E2E-03: Brain Dump to Structured Plan

Input:

> "Need to email Ken, review the launch deck by Friday, practice Japanese 25 min, and pay the invoice."

Expected:

- Creates scoped tasks, categories where appropriate, estimates, due dates when inferable.
- Existing duplicates are not recreated.
- In Ask/Plan, actions queue; in Auto, reversible actions apply.

### E2E-04: Bulk Reschedule

Input:

> "Delay all remaining tasks today by 10 minutes."

Expected:

- Assistant uses current local time and today's tasks.
- Existing tasks' planned times are updated; no junk task created.
- Tool cards show task titles and new times.
- User can revert and reapply each action.

### E2E-05: Plan/Ask/Auto Autonomy

Repeat "move Report to 09:30" under each autonomy setting.

Expected:

- Plan/Ask: pending card, task unchanged until Apply.
- Auto: task changed immediately, Done card.
- Drop task: confirmation required in all modes.

### E2E-06: Revert/Reapply Loop

Steps:

1. Ask assistant to reschedule one task.
2. Apply if needed.
3. Revert.
4. Apply again.
5. Revert again.

Expected:

- Task fields toggle correctly.
- Card state follows Done ↔ Reverted.
- Undo snapshot updates when re-applied.

### E2E-07: Drift Protection

Steps:

1. Assistant updates a task.
2. User manually edits the same task.
3. User clicks Revert on assistant card.

Expected:

- Drift confirmation appears.
- Cancel leaves manual edit intact.
- Confirm restores previous snapshot.

### E2E-08: Memory Learning

Input:

> "I batch admin tasks on Friday afternoons."

Then later:

> "Plan my admin tasks."

Expected:

- Memory review stores durable preference when enabled.
- Later turn injects relevant memory and assistant uses Friday afternoon preference.
- User can inspect/pin/forget memory.

### E2E-09: Retrospective Question

Input:

> "Why did my Japanese practice keep slipping this month?"

Expected:

- Assistant uses recall/retrospective facts.
- It cites deterministic evidence and does not invent numbers.
- It proposes concrete next action.

### E2E-10: End-of-Day Review

Steps:

1. Create completed/dropped tasks and time entries with stop notes.
2. Generate debrief.

Expected:

- Debrief has "where time went / estimate vs reality / one change tomorrow".
- Saved debrief reopens.
- Auto debrief respects scheduling gate.

## 7. Prompt/Tool Eval Set

Create a deterministic eval harness that mocks `generateChat` or runs against selected real providers with fixture data. Each case should assert:

- Required tool-call sequence.
- Forbidden tool calls.
- Final answer constraints.
- Task-state diff.

Recommended initial eval prompts:

1. "Delay every task today by 30 minutes."
   - Must call `list_tasks`, then `update_task` per scheduled task.
   - Must not call `create_task`.
2. "把剩下任务基于当前时间重新排列."
   - Must use current local time and planned times.
   - Must propose/update concrete schedule slots.
3. "Move anything overdue to tomorrow."
   - Must list/search relevant tasks, then update due dates.
4. "Start the most important task now."
   - Must choose high-priority open task, then `start_task`.
5. "Mark Ken interview done and note that follow-up is needed."
   - Must complete the matching task with note when supported.
6. "I need to learn Japanese every day, remember that."
   - Should answer normally; memory review should capture durable preference.
7. "What did I learn from the last report?"
   - Must call `recall`.
8. "How did this week go?"
   - Must use retrospective facts, not raw-row math.
9. "Drop all low-priority backlog tasks."
   - Must treat as destructive and require confirmation.
10. "Create a task that says delay every task by 30 minutes."
    - This is the one case where a literal task may be valid if user explicitly asks for that exact title.

## 8. Risk-Based Priority

P0 must be automated or manually verified before release:

- Provider request/response correctness for all supported providers.
- No junk task creation for unsupported/bulk requests.
- No internal ids/tool names in user-facing replies.
- Plan/Ask/Auto permission behavior.
- Destructive confirmation.
- Apply/revert/reapply correctness.
- Drift protection.
- Current time in prompt and schedule-related behavior.
- No-key/provider-error degraded states.

P1 should be automated where practical:

- Memory learning/retrieval/manager.
- Retrospective/debrief facts and prompt injection.
- Bulk action partial failures.
- UI accessibility and keyboard behavior.
- Persistence/hydration behavior across restart.

P2 can start as exploratory:

- Real provider comparative quality.
- Multilingual prompts (English, Chinese, Japanese).
- Long conversation history behavior.
- Very large task lists and backlog limits.
- Custom soul/profile edge cases.

## 9. Manual Exploratory Charters

1. "Assistant as operator": try 20 natural-language task operations and inspect task-store diffs.
2. "Power user control": apply/revert/reapply/dismiss many cards in non-linear order.
3. "Overcommitted day": create 8h of planned work against a 4h target and ask for a trim.
4. "Ambiguous references": use partial names, multilingual titles, duplicate titles.
5. "Failure recovery": disconnect provider, invalid key, invalid model, provider empty response.
6. "Memory trust": intentionally teach, contradict, pin, and forget preferences.
7. "Truth review": ask retrospective questions with sparse and rich histories.
8. "No internal machinery": scan visible transcript for task ids, JSON, raw tool names, or provider artifacts.

## 10. Test Data Fixtures

Maintain a reusable AI test fixture set:

- Dates: today, tomorrow, overdue, backlog/no due date.
- Priorities: low/medium/high.
- Planned times: complete range, start-only, end-only, no time.
- Statuses: todo, doing, paused, done, dropped.
- Categories: existing category, no category, category requiring creation.
- History: completed tasks with actual time, dropped/stale tasks, stop notes with blockers.
- Memory: active, pinned, archived, duplicate, contradictory.
- Provider payloads: Anthropic text, OpenAI text, Gemini text, Gemini functionCall, empty response, provider error.

## 11. Missing Automation and Harness Recommendations

Add these as engineering tasks:

1. AI eval harness for prompt/tool behavior with fixture task stores and mocked providers.
2. Real-provider smoke tests behind an opt-in env flag, never in default CI.
3. Tauri/UI E2E scripts for assistant panel workflows.
4. Snapshot tests for sanitized transcript rendering and tool-card state matrix.
5. Persistence migration/hydration tests for historical assistant messages.
6. Golden task-state diff tests for common user prompts.
7. Accessibility audit for assistant panel/tool-card controls.
8. Observability logs for tool-call loop: steps, provider, model, tool names, statuses, errors, latency, without leaking API keys.

## 12. AI-Native Product Opportunity Backlog

Synthesized from QA analysis plus an AI-native product expert sub-agent review. The product read is:
Yolo is now a task-operating assistant, but stronger AI-native differentiation needs three layers:
trusted execution, proactive orchestration, and continuous learning.

### P0

- **Reviewable tool-result cards.**
  - User value: users can trust `Auto` / `Apply` because they can see exactly what changed.
  - Why AI-native: the model is not just chatting; it is translating intent into structured, verifiable operations.
  - Dependencies/risks: `ToolCallRecord` likely needs before/after field diffs; risk is noisy cards.
  - Test focus: bulk edits, revert/reapply, field-level before/after display, no internal ids/tool names.
- **Failure recovery loop.**
  - User value: failures do not dead-end; the user can retry or ask the assistant to repair the failed action.
  - Why AI-native: the assistant should reason over its own tool failure and propose the next viable step.
  - Dependencies/risks: provider error mapping, retry policy, "ask assistant to fix" entry point; risk is repeated bad mutations.
  - Test focus: 401/429/empty response/invalid args/tool execution failure; retry does not drift task state.
- **Natural-language eval safety net.**
  - User value: reduces "looks smart but changed the wrong thing" incidents.
  - Why AI-native: the core product contract is intent -> tools -> verified task/time change, which normal unit tests do not fully cover.
  - Dependencies/risks: golden fixtures and optional real-provider smoke tests; risk is eval maintenance cost.
  - Test focus: rescheduling, bulk time shifts, destructive confirmation, recall, no placeholder task creation.

### P1

- **Tomorrow Planner.**
  - User value: moves from "remember my tasks" to "build tomorrow from reality."
  - Why AI-native: fuses backlog, due dates, actual capacity, and calibration into an executable day plan.
  - Dependencies/risks: retrospective data quality, permission modes, low-history fallback; risk is over-promising capacity.
  - Test focus: capacity constraints, due-date priority, low-history degradation, Plan/Ask/Auto consistency.
- **Proactive schedule repair.**
  - User value: when planned slots slip, Yolo proposes a repair instead of making the user manually recalculate.
  - Why AI-native: combines current time, planned slots, task priority, and update tools into dynamic orchestration.
  - Dependencies/risks: day briefing, current-time context, bulk `update_task`; risk is interruptive or wrong rescheduling.
  - Test focus: late slots, overdue tasks, partial failures, per-card revert/reapply.
- **Semantic recall and conversation memory.**
  - User value: users stop repeating context and can ask "why did this block me last time?"
  - Why AI-native: retrieves meaning across stop notes, tasks, and prior conversations, not only exact keywords.
  - Dependencies/risks: retrieval/index design and cost; risk is wrong recall harming trust.
  - Test focus: multilingual recall, contradictory memories, pin/forget behavior, recall boundaries.
- **Evaluation dashboard.**
  - User value: makes assistant quality visible to product/engineering.
  - Why AI-native: tracks the operational quality of model-tool loops, not just UI health.
  - Dependencies/risks: event schema and privacy-safe logs; risk is over-instrumentation.
  - Test focus: tool-call validity, apply/dismiss/revert rates, provider failures, latency.

### P2

- **Focus Coach.**
  - User value: timely nudges when a focus session overruns, needs splitting, or should pause.
  - Why AI-native: combines real-time focus behavior with historical calibration.
  - Dependencies/risks: live signal thresholds and notification cadence; risk is nagging.
  - Test focus: 90-minute overrun, frequent switching, reduced false positives, quiet hours.
- **Multimodal capture.**
  - User value: email, screenshot, or voice can become a structured task plan.
  - Why AI-native: turns unstructured input into executable task/time objects.
  - Dependencies/risks: import channels, parsing quality, duplicate detection; risk is task over-splitting.
  - Test focus: screenshots, email-like text, mixed Chinese/Japanese/English input, duplicate handling.
- **Time-leak detection.**
  - User value: helps answer "where did the missing time go?"
  - Why AI-native: detects gaps and asks for clarification at the right moment, then improves review truth.
  - Dependencies/risks: time-entry completeness and prompt timing; risk is false-positive interruptions.
  - Test focus: untracked gap detection, follow-up frequency, debrief improvement.
- **Life-weeks meaning layer.**
  - User value: connects daily time choices to long-term perspective.
  - Why AI-native: narrates structured time patterns in a personally meaningful way.
  - Dependencies/risks: life-week data, tone control; risk is sounding moralizing.
  - Test focus: factual calculations, tone boundaries, opt-in surfaces.

## 13. Exit Criteria

Before marking the AI assistant release-ready:

- All P0 automated tests pass in `yarn test`.
- `yarn build` passes.
- Manual E2E-01 through E2E-08 pass on at least one real provider and one mocked provider path.
- Gemini native tool-call path passes a live smoke test when configured.
- No visible internal ids/tool names in transcript screenshots.
- Destructive writes always confirm.
- Revert/reapply works across update/create/complete/move/drop classes where supported.
- Product owner signs off on AI-native opportunity backlog priority.
