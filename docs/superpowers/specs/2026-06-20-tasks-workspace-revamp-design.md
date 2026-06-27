# Tasks Workspace Revamp — Design Spec

**Date:** 2026-06-20
**Status:** Approved design, pending implementation plan
**Supersedes:** the current single-column `BacklogPage`

## Problem

The current Backlog page (`src/components/backlog/BacklogPage.tsx`, one ~390-line
file) is hard to use:

1. **No overview** — one long scrolling column buries tasks.
2. **No structure** — only "Scheduled vs Backlog"; no way to organize by
   priority, category, status, or other buckets.
3. **Reorganizing is clunky** — every change is a button click; no drag-and-drop.
4. **No focus/filter** — can't narrow by category, priority, status, or search.

(Card density was *not* flagged as a top pain, but the revamp improves it anyway.)

## Product decisions

- **One task database, many views** (the dominant pattern in Todoist, TickTick,
  Linear, Notion). The page becomes a **task workspace** over *all* tasks, but
  **defaults to the open pipeline** (`todo` / `doing` / `paused`; `done` hidden
  behind a toggle). Every view and group-by is just a different projection of the
  same `taskStore.allTasks` array. Avoids a second task store that can drift.
- **Today / My Day remain the execution surfaces** (timer, focus, debrief). This
  page is where you *organize the pipeline*; Today is where you *do*. Today is
  simply one filtered slice of the same tasks — no real overlap.
- **Rename the page "Tasks"** ("Backlog" stops being accurate once it has
  Board/Status/Calendar). Backlog becomes one column/filter inside it. The route
  id `backlog` is renamed to `tasks` (update `App.tsx` route union and the nav
  item); confirm no other deep-link depends on the literal `backlog` id.
- **Drag-and-drop foundation: `dnd-kit`** (new dependency, ~industry standard).
  Chosen over `framer-motion`'s `Reorder` (already installed) because only
  dnd-kit does cross-column drag (Board/Calendar) and keyboard-accessible DnD
  cleanly. `Reorder` is single-list only and would fight the core feature.

## Architecture: one view engine, swappable renderers

```
taskStore.allTasks
      │
      ▼
 useTaskWorkspace(tasks, settings)   ← reads workspaceStore (view, groupBy, filters, search, showDone)
      │   filter → search → group → sort   (pure, deterministic)
      ▼
 groups: { key, label, color?, tasks[] }[]
      │
      ▼
 <ViewRenderer>  →  Board | List | Table | Calendar   (pure renderers, same props)
```

- **`useTaskWorkspace`** is the single source of truth for *what* is shown. It
  filters, searches, groups, and sorts deterministically and returns the same
  `groups[]` shape to every view. Views never re-derive data.
- **All drag operations resolve to one mutation:** `updateTask(id, { … })`. A drop
  computes which field changes from the drop target (see Group-by table). Reuses
  the existing optimistic `updateTask` and `sort_order` handling in `taskStore`.

## Toolbar (shared across all views)

```
[ Board | List | Table | Calendar ]   Group by ▾   🔍 Search   Category ▾  Priority ▾  Status ▾   ◻ Show done   + Add
```

- View, group-by, filters, search, and show-done live in a **`workspaceStore`**
  slice, **persisted to localStorage** using the existing helper pattern in
  `uiStore.ts`. Reopen the app → same view and settings.
- Filters are composable AND-logic. Search matches task title and description.
  Show an active-filter count badge with a "Clear" affordance when any are set.

## Group-by + drag semantics (drives Board columns / List sections)

| Group by | Columns / sections | Drag-to-column sets |
|---|---|---|
| **Time horizon** (default) | Backlog · Today · Tomorrow · Upcoming · *(Overdue — only shown if non-empty)* | `due_date`: Backlog→`null`, Today→today, Tomorrow→+1; **Upcoming → opens a date picker** (range is ambiguous, so prompt) |
| **Status** | To do · Doing · Paused · Done | `status` (status change only — does **not** start a timer; execution stays on Today) |
| **Priority** | High · Medium · Low · None | `priority` |
| **Category** | one column per category · Inbox | `category_id` |

- **Within a column**, drag reorders → updates `sort_order` (fractional or
  rebalanced strategy; decided in the implementation plan).
- Empty columns still render as dashed drop targets with an empty hint.
- Default group-by = **Time horizon** (matches Yolo's "plan the day" throughline).

## The four views

- **Board** — horizontally scrolling columns. Each column: header (label + count +
  per-column `+`) and a scrollable card stack. dnd-kit cross-column + reorder,
  keyboard-accessible.
- **List** — collapsible section per group; dense single-line rows
  (title · category dot · priority · due · estimate · hover actions); drag to
  reorder/regroup. Highest density → addresses the "overview" pain.
- **Table** — sortable columns (Title, Status, Priority, Category, Due, Estimate);
  inline-editable cells; row drag to reorder. Best for bulk scanning/editing.
- **Calendar** — month grid; tasks render on their `due_date`; drag a task onto a
  day sets `due_date`. Unscheduled tasks sit in a side "Backlog" rail you drag
  from. Click a day → that day's task list.

## Card / row

- **Card** (Board, Calendar): color spine, title, meta row (category dot ·
  priority dot · due chip · estimate). **Hover reveals** quick actions (Start,
  reschedule menu, edit, delete) instead of always-on buttons — recovers vertical
  space vs today's card. Click body → edit (reuse the current edit form, extracted
  into `TaskEditForm`).
- **Row** (List, Table): single-line variant of the same data.

## File structure (focused files, <300 lines each)

```
src/components/tasks/
  TasksPage.tsx              (replaces BacklogPage; toolbar + active view)
  Toolbar.tsx
  views/
    BoardView.tsx
    ListView.tsx
    TableView.tsx
    CalendarView.tsx
  TaskCard.tsx
  TaskRow.tsx
  TaskEditForm.tsx
  EmptyColumn.tsx
src/hooks/useTaskWorkspace.ts     (filter/group/sort engine — pure, unit-tested)
src/stores/workspaceStore.ts      (view/groupBy/filters/search/showDone, persisted)
src/utils/taskGrouping.ts         (extend the existing file)
```

Routing: in `App.tsx`, route `tasks` renders `TasksPage`; nav label becomes
"Tasks". Old `backlog` route id renamed to `tasks`.

## Build order (phased, each shippable)

1. **Phase 1** — Toolbar + `useTaskWorkspace` + `workspaceStore` + **Board** +
   **List**. Adds `dnd-kit`. Covers pains 1/2/3/4. Renames page/route.
2. **Phase 2** — **Table** view.
3. **Phase 3** — **Calendar** view.

## Testing

- `useTaskWorkspace` and `taskGrouping`: pure vitest unit tests for every
  group-by, filter combination, search, sort order, and empty state — the
  deterministic core.
- Drag → mutation mapping: unit-test the "drop target → `updateTask` payload"
  resolver in isolation.
- Verify each phase with `yarn build` (tsc + vite) and `yarn test`.

## Out of scope / YAGNI

- Saved/custom views, sharing, multi-select bulk edit, swimlanes — not in this
  revamp.
- Custom user-defined buckets beyond the four group-by dimensions.
- Changing the underlying `Task` data model — the workspace is purely a new
  presentation/interaction layer over existing fields.
