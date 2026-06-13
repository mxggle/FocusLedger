# "My Day" — premium daily review page

**Date:** 2026-06-13
**Status:** Approved, implementing

## Summary

Replace the small, text-only daily-debrief dialog with a first-class **"My Day"**
page: a premium, chart-rich review of a single day. Charts lead (always available,
no AI key required); the AI narrates ("story of your day" + one change for tomorrow).
The page supports navigating to **any past day**, not just today.

## Decisions

- **Surface:** dedicated route `my-day` in the left sidebar (label "My Day", icon `Sparkles`).
- **Dialog removed:** `DebriefDialog` deleted; the Today-page button and the
  post-auto-debrief toast navigate to the page instead.
- **AI role:** charts lead, AI narrates. Page is fully useful with no AI key.
- **Scope:** today by default, with prev/next + past-day navigation.
- **Layout:** Editorial (single scrolling column, generous spacing).
- **No chart library:** hand-rolled SVG/CSS, matching the existing project style.

## Layout (top → bottom)

`DateNavigator` → `HeroStatBand` → `DayStory` (AI) → `DayTimeline` (full-width)
→ `CategoryDonut` + `EstimateVsActual` (two-up) → `SessionList`.

## Components — `src/components/myday/`

- `MyDayPage.tsx` — page shell + per-date data orchestration.
- `DateNavigator.tsx` — prev/next + date label + native date input; "next" disabled past today.
- `HeroStatBand.tsx` — focused time / tasks done / drift.
- `DayTimeline.tsx` — **signature**: sessions as category-colored blocks on an hour axis, hover tooltip.
- `CategoryDonut.tsx` — SVG donut + legend.
- `EstimateVsActual.tsx` — planned vs actual bars + drift.
- `DayStory.tsx` — renders saved debrief or a generate/update CTA; reuses extracted `DebriefContent`.
- `SessionList.tsx` — session cards (note / blocker / next action / felt-completion %).

Extract the Markdown renderer from `DebriefDialog` into `src/components/myday/DebriefContent.tsx`.

## Pure helpers (testable, no React)

`src/components/myday/timelineLayout.ts`:
- `buildTimelineModel(entries, date, now)` → `{ startHour, endHour, blocks: [{ leftPct, widthPct, color, label, ... }] }`
  computed from session start/end clamped to the day's active window.

`src/components/myday/donutModel.ts`:
- `buildDonutSegments(categoryStats)` → segments with `{ dashArray, dashOffset, color, pct }`.

`src/utils/date.ts` (extend): `isFutureDateKey(dateKey, now)` for nav bounds (or keep local in `DateNavigator`).

## Data flow (`MyDayPage`)

1. `viewDate` state (default `toDateKey(now)`).
2. Entries: `viewDate === today` → live `taskStore.todayEntries`; else
   `timeEntryRepository.getEntriesForDate(viewDate)` loaded in an effect.
3. `stats = calculateTodayStats({ date: viewDate, tasks: allTasks, timeEntries: entries, categories, now })`.
4. `debrief = debriefRepository.getForDate(viewDate)`.
5. Render modules from `stats` + `entries`; `DayStory` from `debrief`.

## AI generalization — `debriefRunner.ts`

Generalize "today only" to any date without touching `debriefService`:
- `buildDebriefData(date, { tasks, entries, categories, settings, now })`.
- `runDebrief(date, now)` → builds data, generates, saves.
- `debriefInputHashForDate(date, now)` for the "update only when data changed" check.
- Keep `runTodayDebrief(now)` and `todayDebriefInputHash(now)` as thin wrappers
  (scheduler + any existing callers unchanged).

For a **past day**, generation uses that date's loaded entries; for **today**, live entries.

## Navigation wiring — `uiStore`

- Replace `debriefDialogOpen`/`setDebriefDialogOpen` with a route-request:
  `requestedRoute: RouteId | null` + `requestRoute(route)`.
- `App.tsx` effect: when `requestedRoute` is set, `setRoute(it)` and clear it.
- `DebriefButton` → `requestRoute("my-day")`. Scheduler toast "View" → `requestRoute("my-day")`.
- `App.tsx`: add `my-day` to `RouteId` + `routes`; render `MyDayPage`; remove `<DebriefDialog />`.

## States & errors

- **No AI key:** charts render; `DayStory` shows "Connect a provider in Settings → AI".
- **No activity that day:** hero zeros; timeline/donut/sessions show empty states; `DayStory` invites logging focus.
- **AI failure:** error toast (existing pattern); charts unaffected.
- **Entry-load failure:** logged; inline empty state.

## Testing (vitest, pure logic)

- `timelineLayout.test.ts` — block placement, clamping running/out-of-window entries.
- `donutModel.test.ts` — segment dash math sums correctly; handles single/empty.
- date-bound helper — no future navigation.
- `debriefRunner.test.ts` (extend) — `buildDebriefData(date)` yields correct per-date inputs; wrappers still work.

## Out of scope (v1)

- Cross-day trend charts (that's the History page's role).
- Export/share of the day.
- AI captions per-chart (rejected in favor of one narrative).
