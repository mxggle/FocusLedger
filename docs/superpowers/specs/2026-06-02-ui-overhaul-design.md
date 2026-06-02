# FocusLedger UI/UX Overhaul — Design Spec

**Date:** 2026-06-02
**Status:** Approved (design direction confirmed via visual companion)
**Scope:** Comprehensive UI/UX refresh of the entire app. **Visual/interaction layer only** — no changes to business logic, database, repositories, services, or store *behavior*. The only store change permitted is adding layout/collapse UI state to `uiStore`.

---

## 0. Confirmed Direction

- **Visual style:** Soft & Modern — light surface, white cards, soft low-opacity shadows, large rounded corners, subtle gradients/motion. Dark mode at parity.
- **Layout:** Collapsible 3-pane. Keep Today's three panes (Tasks / Focus / Log+Summary). Each pane individually collapses to a thin rail; sidebar collapses icon ⇄ labeled. Remove hard min-widths; adaptive.
- **Accent:** Blue (`blue-600` family).

## 1. Goals & Non-Goals

**Goals**
- Replace the plain/flat look with a polished, calm, easy-to-read "soft modern" system.
- Make panels collapsible/expandable (sidebar + Today panes), with state persisted across reloads.
- Remove rigid `min-width` constraints; make layout adaptive to window width.
- Refresh every component and page consistently; leave no surface untouched.
- Keep it simple, legible, and easy to operate — clarity over decoration.

**Non-Goals**
- No changes to data model, DB migrations, repositories, services, or timer/task logic.
- No new product features. No routing changes.
- No new heavy dependencies (work within existing: tailwind, lucide-react, clsx/cva/tailwind-merge, zustand).

## 2. Design Tokens

Implement in `src/styles.css` (CSS variables, light + `.dark`) and `tailwind.config` (extend colors / borderRadius / boxShadow / keyframes / transitionTimingFunction). All component code consumes tokens — **no hardcoded colors**.

### Color (reference values; implement as HSL CSS vars)

Light:
- `background`: cool light gray ≈ `#f4f5f8`
- `surface` / card: `#ffffff`
- `foreground`: ≈ `#15181f` (slate-900-ish)
- `muted`: ≈ `#eef0f4`; `muted-foreground`: ≈ `#6b7280`
- `border`: ≈ `#e6e8ee`; `input`: slightly darker border
- `primary`: `blue-600` `#2563eb`; `primary-foreground`: white
- `primary-soft`: `blue-50/100` (selected-state/tag backgrounds), `primary-soft-foreground`: `blue-700`
- `ring`: `blue-400`
- `success` `#16a34a` (+ `success-soft`); `warning` `#f59e0b` (+ soft, used for timer overrun); `destructive` `#dc2626` (+ soft)

Dark (parity; deep slate, not pure black):
- `background` ≈ `#13161c`; `surface` ≈ `#1b1f27`
- `foreground` ≈ `#e6e9ef`; `muted` ≈ `#232831`; `muted-foreground` ≈ `#9aa1ad`
- `border` ≈ `#2a303b`
- `primary`: `blue-500` `#3b82f6` (slightly brighter for dark); soft variants tinted dark.
- success/warning/destructive: dark-appropriate tints.

Add new token names beyond current set: `surface`, `primary-soft` (+fg), `success`(+fg/soft), `warning`(+fg/soft). Keep existing names working.

### Radius
`--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`, `--radius-xl: 20px` (default card), `--radius-full`. Tailwind `rounded-{sm,md,lg,xl}` map to these.

### Shadow
- `shadow-sm`: hairline elevation for resting cards
- `shadow-card`: default card (soft, ~`0 2px 12px rgba(20,28,45,.06)`)
- `shadow-pop`: dialogs/menus/toasts (`0 12px 32px rgba(20,28,45,.14)`)

### Typography
- Font: keep Inter stack. Enable tabular-nums utility for timers/durations.
- Scale: `xs 12 / sm 13 / base 14 / lg 16 / xl 20 / 2xl 24 / timer ~56`. Headings tighter tracking.

### Motion
- `--ease: cubic-bezier(.22,.61,.36,1)`; durations 150ms (hover), 200ms (collapse/slide).
- Keyframes for toast/dialog enter, pane collapse. Respect `prefers-reduced-motion` (disable transforms/transitions).

## 3. Component Library

Location: `src/components/ui/`. Use `cva` for variant management where it helps. All focusable controls get visible focus ring (`ring`). Accessible names on icon-only controls.

**Refresh (rewrite styling, keep API compatible where used):**
- `Button` — variants `primary | secondary | ghost | danger | soft`; sizes `sm | md | lg | icon`; `loading` state (spinner, disabled); focus ring.
- `Badge` — semantic variants `neutral | primary | success | warning | danger` (soft backgrounds) instead of bare span.
- `Progress` — rounded track, gradient fill, `overrun` → warning color; optional label.
- `Switch`, `Field` — restyle to tokens; Field gets consistent label/hint/error layout.
- `ConfirmDialog` — modal shell with backdrop blur, `shadow-pop`, enter animation, icon for danger.
- `ToastViewport` / toast item — card style, kind icon, soft accent border, slide/fade animation, action buttons.

**New:**
- `Card` — surface container (radius-xl, shadow-card, optional header/title/action slots).
- `IconButton` — square icon button (used in toolbars, pane headers).
- `Tooltip` — lightweight hover/focus tooltip (required for collapsed sidebar icons & pane rails).
- `SegmentedControl` — pill segmented toggle (for filters/views where current UI uses ad-hoc buttons).
- `CollapsiblePane` — pane wrapper: header (title + collapse toggle), animated collapse to a thin rail showing vertical title + expand affordance. Controlled via props (`collapsed`, `onToggle`).
- `EmptyState` — icon + title + hint + optional action; replaces ad-hoc empty messages.
- `Skeleton` — shimmer placeholder; replaces plain "Initializing local SQLite database…" text with skeleton layout.

Keep files small and focused (one component per file).

## 4. Layout Shell (`AppShell`)

- **Collapsible sidebar:** labeled (≈220px) ⇄ icon-only (≈64px). Toggle button at top of sidebar. Collapsed state shows Tooltips on hover/focus. Active route uses `primary-soft` background + primary text/icon.
- **Top bar:** thin per-page header band rendered by the shell or page — page title, date/context, and slot for page-level actions. Keep `title`/`subtitle` branding in expanded sidebar header.
- Remove `body { min-width: 960px }` (in `styles.css`) and Today's `min-w-[1000px]`. Layout adapts down gracefully.
- Sidebar collapsed state persisted (see §6).

## 5. Pages

**Today (`TodayPage` + children)** — primary focus of the overhaul:
- Three panes wrapped in `CollapsiblePane`: **Tasks** (`AddTaskForm` + `TaskList`), **Focus** (`CurrentFocus`), **Log** (`TodayLog` + `TodaySummary`). Each collapses independently to a rail; Focus is the priority pane (last to auto-collapse).
- **CurrentFocus:** timer is the hero — large tabular-nums, on a `Card`, prominent progress (bar or ring), overrun → warning color + label, control buttons (`Pause` secondary, `Stop` secondary, `Done` primary) grouped and clearly weighted. Idle → `EmptyState`.
- **TaskCard** (largest file, 399 lines): visually re-architected — clearer hierarchy, status colors, the dropdown action menu rebuilt as a proper styled menu with all actions visibly working. Split into smaller pieces if it improves clarity. **Logic and handlers unchanged.**
- **TaskList / TodayLog / TodaySummary / AddTaskForm:** card-ize, align spacing, use new primitives, consistent empty states.

**Backlog / Plan / History / Settings / QuickAddDialog:**
- Apply tokens + new components uniformly: cards, spacing rhythm, buttons, inputs, badges, empty states, dialog shell.
- Where these pages have ad-hoc filter/toggle buttons, use `SegmentedControl`.
- **UI presentation only — do not change their logic or data flow.**

## 6. Collapse / Expand State & Persistence

- Add layout UI state to `uiStore`:
  - `sidebarCollapsed: boolean`
  - `todayPanes: { tasks: boolean; focus: boolean; log: boolean }` (collapsed flags)
  - toggle actions for each.
- Persist to `localStorage` (hydrate on load, write on change). Keep it minimal and immutable-update style (per coding rules).
- Add/extend `uiStore.test.ts` to cover the new toggle actions and default state.

## 7. Responsiveness

- Define breakpoints behavior: at narrow widths, panes auto-collapse by priority (Log first, then Tasks; Focus stays). Sidebar can auto-collapse to icons on narrow widths.
- No horizontal scroll from rigid min-widths. Everything usable in a small window.

## 8. Accessibility

- Keyboard operable: sidebar toggle, pane toggles, menus, dialogs (focus trap + Esc), toasts.
- Visible focus rings; `aria-label`/`aria-expanded` on toggles; icon-only buttons have accessible names + Tooltips.
- `prefers-reduced-motion` respected.
- Maintain adequate contrast in both themes.

## 9. Implementation Phases

Incremental and independently verifiable:

- **Phase A — Foundation:** design tokens (`styles.css` + `tailwind.config`); refresh + add UI primitives (`Card`, `IconButton`, `Tooltip`, `SegmentedControl`, `CollapsiblePane`, `EmptyState`, `Skeleton`, plus restyled `Button/Badge/Progress/Switch/Field/ConfirmDialog/ToastViewport`).
- **Phase B — Shell:** `AppShell` collapsible sidebar + top bar; remove min-widths; `uiStore` sidebar state + persistence.
- **Phase C — Today:** `CollapsiblePane` integration, hero `CurrentFocus`, `TaskCard` + list/log/summary refresh; `uiStore` pane state + tests.
- **Phase D — Other pages:** Backlog, Plan, History, Settings, QuickAddDialog restyle.
- **Phase E — Responsive & polish:** breakpoint/auto-collapse behavior, reduced-motion, final pass for consistency.

## 10. Verification

- `yarn build` (tsc + vite) passes; `yarn test` (vitest) passes after each phase.
- New `uiStore` collapse logic covered by unit tests.
- Run `yarn dev` and visually confirm each page in light **and** dark mode, plus collapse/expand and a narrow-window pass.
- No business-logic regressions: existing task/timer/schedule behavior unchanged (existing tests stay green).

## 11. Constraints / Guardrails

- Do not modify: `db/`, `services/`, `stores/{taskStore,timerStore,settingsStore}` behavior, `types/`, repositories, migrations.
- `uiStore`: additive only (layout state).
- No new runtime dependencies without flagging.
- Follow repo patterns; keep files focused (<~400 lines; split large ones).
- Immutable state updates; no hardcoded colors/values (use tokens).
