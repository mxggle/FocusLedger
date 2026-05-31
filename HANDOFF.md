# FocusLedger Handoff

Last updated: 2026-05-31

This document is the working handoff for continuing FocusLedger across Codex sessions. Start every new session by reading this file, checking `git status --short`, and confirming the current phase before editing code.

## Current Snapshot

Current completed milestone:

- V1 recurring plan templates shipped in commit `a38b58a Add recurring plan templates`.
- Phase 1 / V1.1 "Skip today" for generated plan tasks implemented locally (not committed).
- Phase 2 one-off planned time editing for today's generated tasks implemented locally (not committed).

What V1 added:

- `Plan` route and page for creating reusable plan items.
- Daily / weekdays / custom weekly recurrence.
- `task_templates` table for reusable plans.
- `template_occurrences` table for idempotent per-date generation.
- `tasks` fields for `template_id`, `planned_start_time`, `planned_end_time`, and `sort_order`.
- Today refresh generates today's matching plan tasks before loading the task list.
- Today task cards display planned time.

What V1.1 added:

- Generated plan task cards now expose a `Skip today` action.
- Skipping a generated plan task marks the task `dropped` instead of deleting it.
- Skipping records `template_occurrences.skipped_at` through repository/service methods.
- Active time entry for the skipped task is closed before the task is dropped.
- Generation remains idempotent because skipped occurrences are not regenerated.
- Focused schedule service tests cover skip persistence and no-regeneration behavior.

What Phase 2 added:

- Today task edit mode now exposes `Today start` / `Today end` for generated tasks due today.
- Saving those fields updates only the task instance (`tasks.planned_start_time`, `tasks.planned_end_time`, `tasks.sort_order`).
- Template rows are not updated from Today.
- The edited start time is required for generated task instances so Today ordering remains stable.

Known uncommitted work that existed outside the plan feature:

- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src-tauri/icons/**`
- `src/hooks/**`
- `src/App.tsx` still has an unstaged `useTrayStatus` import/call from earlier work.

Do not revert or absorb those unrelated changes unless the user explicitly asks.

Known uncommitted work from Phase 1:

- `src/components/today/TaskCard.tsx`
- `src/db/taskTemplateRepository.ts`
- `src/services/scheduleService.ts`
- `src/services/scheduleService.test.ts`
- `src/stores/taskStore.ts`
- `HANDOFF.md`

Known uncommitted work from Phase 2:

- `src/components/today/TaskCard.tsx`
- `HANDOFF.md`

## Architecture Rules

Keep this boundary intact:

- `task_templates` describe reusable intent.
- `template_occurrences` records whether a template/date has been processed, skipped, or generated.
- `tasks` are the actual daily executable work items.
- `time_entries` remain the source of actual time tracking.

Template changes should affect future generation only. Do not silently overwrite today's already generated task after the user may have edited or started it.

Prefer services for business rules:

- Keep recurrence/generation logic in `src/services/scheduleService.ts`.
- Keep persistence in repository files under `src/db`.
- Keep React components focused on UI state and dispatching store actions.

## Phase Plan

### Phase 1: Stabilize V1 Plan Instances

Status: Completed locally on 2026-05-31.

Goal:

Make generated tasks easier to manage on a single day without breaking template history.

Tasks:

- [x] Add a clear "Skip today" action for a generated task.
- [x] When skipping, mark the matching `template_occurrences.skipped_at`.
- [x] Decide whether "Skip today" should delete the generated task, mark it dropped, or hide it from Today.
- [x] Add repository/service methods for occurrence updates instead of manipulating rows from components.
- [x] Add focused tests for skip/idempotency behavior.

Recommended next implementation:

- Add `skipOccurrenceForTask(taskId)` or `skipTemplateForDate(templateId, date)` to `scheduleService`.
- Add `taskTemplateRepository.skipOccurrence(...)`.
- Expose a `skipPlannedTask(taskId)` action from `taskStore`.
- Add a small secondary/ghost button to `TaskCard` only when `task.template_id` is present.

Review concerns:

- If skipping deletes a task with time entries, it may destroy useful history.
- If skipping marks `dropped`, it will appear in History as intentionally abandoned.
- If skipping only hides from Today, the query needs a durable way to exclude it.

Recommended product decision:

- For V1.1, skip marks the task `dropped` with a clear occurrence `skipped_at`. This preserves history and prevents regeneration.

Verification:

- `npm test -- --run`
- `npm run build`

### Phase 2: Edit Today's Planned Time

Status: Completed locally on 2026-05-31.

Goal:

Allow one-off adjustments to today's generated task without modifying the template.

Tasks:

- [x] Add `planned_start_time` / `planned_end_time` editing in `TaskCard` edit mode.
- [x] Make it clear this edits the task instance only.
- [x] Keep template editing in `PlanPage`.
- [x] Add tests or at least build verification.

Review concerns:

- Do not update `task_templates` from Today.
- Do not regenerate over user-edited task instance times.

Verification:

- `npm test -- --run`
- `npm run build`

### Phase 3: Plan Page Status

Goal:

Make the Plan page show whether each template applies today and whether it already generated a task.

Tasks:

- Add a read query for today's occurrences.
- Display badges such as `Generated today`, `Not today`, `Skipped today`, `Off`.
- Avoid creating tasks just because the Plan page is viewed, unless the global refresh already does so.

Review concerns:

- Keep "status display" separate from "generation side effect" where possible.

### Phase 4: Prepare Weekly Planner

Goal:

Refactor Plan UI toward a week-board without changing the persistence model.

Tasks:

- Add grouped rendering by weekday and start time.
- Add duplicate/copy actions for a plan item.
- Add optional bulk enable/disable.
- Keep the existing list view usable if the week board is incomplete.

Potential data additions:

- `effective_from`
- `effective_until`
- `timezone`

Do not add these until there is a concrete UI or product need.

### Phase 5: Reminders and Drift

Goal:

Use planned times to drive notifications and review insights.

Tasks:

- Use `planned_start_time` for start reminders.
- Use `planned_end_time` and `time_entries` to calculate delay/overrun.
- Add notification throttling so the same plan instance does not notify repeatedly.
- Add daily review fields for missed/skipped/delayed planned tasks.

Potential data additions:

- `template_occurrences.notified_start_at`
- `template_occurrences.notified_overrun_at`
- `template_occurrences.missed_at`

## Session Checklist

At the start of a new session:

1. Read `HANDOFF.md`.
2. Run `git status --short`.
3. Identify unrelated dirty files and leave them alone.
4. Run or inspect the relevant files before editing.
5. Implement only the current phase unless the user redirects.
6. Run `npm test -- --run` and `npm run build` when touching TypeScript behavior.
7. Update this file before final response if a phase is completed, changed, or blocked.

## Handoff Update Rules

When a phase is completed:

- Move the completed work into `Current Snapshot`.
- Mark the phase as completed or remove completed task bullets.
- Update `Last updated`.
- Add the commit hash if a commit was created.
- Add new known risks or dirty-worktree notes.
- Set the next recommended phase clearly.

When a decision is made:

- Record the decision under the relevant phase.
- Include why it was chosen if it affects future architecture.

When blocked:

- Add a `Blocked` note with the concrete blocker.
- Include the last command or file checked if useful.

## Current Next Step

Recommended next step:

- Phase 3: show per-template status on the Plan page for today.
