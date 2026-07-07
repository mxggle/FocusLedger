# Changelog

## 0.7.1 - 2026-07-08

A polish-and-reliability release on top of 0.7.0. Focus gains a set of clock
faces, the backlog gets two new ways to see your work, breaks get their own
fullscreen mode, and the built-in AI assistant becomes noticeably more
dependable when it edits your tasks. A batch of notification and macOS/Windows
fixes rounds it out.

### Added

- **Focus clock faces.** The focus timer is no longer a single ring. Pick from
  four faces — **Ring**, **Countdown**, **Dial**, and **Minimal** — from the
  focus-style control next to your session. The typographic *Minimal* face
  spreads across the pane so the digits can lead; the circular faces keep a tidy
  orb. Your choice is remembered between sessions and, like the ambient sliders,
  saves quietly without spamming toasts.
- **Backlog board & table views.** Alongside **Cards** and **List**, the backlog
  now offers a **Board** view for scanning work in columns and a compact
  **Table** view for dense, spreadsheet-style triage. All four views respect the
  same grouping, sorting, and scope filters, and the selected view persists.
- **Fullscreen rest mode (Rest Zen).** Breaks now have their own fullscreen
  counterpart to Focus Zen. A running break shows a dedicated rest card and can
  expand to a calm fullscreen rest screen; minimizing drops back to the card
  **without ending the break**. Rest keeps its own timer and record and still
  never counts as focused time.

### Changed

- **Focus and rest are now mutually exclusive.** Starting a task automatically
  ends any break in progress, and starting a break pauses the running task — so
  the Focus pane always reflects exactly one thing at a time.
- **One control for clock, scene, and sound.** The focus atmosphere popover now
  leads with a clock-face picker above the scene and sound mixer, all driven by
  shared manifests so the picker stays in sync as faces and scenes are added.
- The in-app AI assistant now shows and accepts **short, transcription-friendly
  task ids** (e.g. `task_e41f3a2b`) across its tools.

### Fixed

- **The assistant no longer loses edits to mangled task ids.** Smaller models
  frequently garble the full 41-character task id when copying it into a tool
  call. Task references now resolve from an exact id, a short id, a unique id
  prefix (with or without the `task_` prefix or dashes), or a unique exact
  title. An ambiguous reference resolves to *nothing* rather than guessing at
  the wrong task, and the assistant is handed the closest matches so it can
  retry.
- **Task edits fail loudly instead of silently.** After a task is written, Yolo
  now verifies the refreshed state actually contains the requested values and
  reports a clear error if a write didn't stick, instead of appearing to
  succeed.
- **Fullscreen reminders no longer get dropped.** A race where a newer reminder
  staged while the previous one was still animating out could silently discard
  the newer notification — it now re-shows the newer reminder instead.
- **Reminders appear on the screen you're working on.** The fullscreen
  notification now covers the monitor the app is actually on, falling back to
  the primary monitor only when that can't be determined.
- **Notification listeners recover from failures** (they can re-register on a
  later attempt) and no longer leak handlers when a window is reused for a new
  reminder.
- **The rest countdown no longer freezes on refresh.** The shared timer ticker
  now stays alive during a break, so reloading mid-rest keeps the countdown
  running.
- Removed the unused popup notification window and tightened its permissions to
  just the fullscreen reminder surface.

### Platform & internals

- **macOS native code hardened.** Traffic-light positioning and the menu-bar
  monospaced-digit timer were migrated off the maintenance-mode `cocoa` id
  aliases onto direct `objc` runtime object pointers, keeping the same
  null-checked, main-thread safety guarantees.
- **Fullscreen capability added** (`set-fullscreen` / `is-fullscreen`) to
  support the focus and rest zen overlays.

### Validation

- `yarn build` (tsc + vite), `yarn test` (100 files, 720 tests), and
  `cargo check` all pass. Clock faces, backlog views, rest mode, task-reference
  resolution, task-update verification, and notification handling are
  unit-tested.

## 0.7.0 - 2026-07-04

This release makes capturing tasks effortless and the day itself visible.
Quick-add learns to fill in the details for you with **AI smart capture**, the
Today page gains a **day line** that paints where your time actually went, the
backlog becomes a real workspace with views and sorting, and the whole app
moves with a calmer, more deliberate motion language.

### Added

- **AI smart capture.** Type a task the way you'd say it — "review the deck
  tomorrow, high prio, ~30m" — and quick-add fills in the category, priority,
  estimate, and due date with one low-temperature AI call. Your text is never
  lost: if the model's answer doesn't validate, the task is created as plain
  text exactly as typed. Opening the advanced fields switches to fully manual
  entry, and says so.
- **Day header with a day line.** Today now opens with the date, a live clock,
  and a midnight-to-midnight timeline where every tracked session paints a
  segment in its category color — where your time went, in one glance. A knob
  rides the present moment, and the header counts total focused time.
- **Backlog views.** The backlog gets a toolbar with grouping, sorting, and
  view preferences that persist, plus reworked task rows — turning it from a
  flat list into a place you can actually triage.
- **macOS menu-bar timer.** The tray is now a text-only status item showing
  the running timer in fixed-width digits (no more jitter every second) and a
  compact format — "25:34" instead of "00:25:34". When nothing is running it
  reads "Yolo" instead of vanishing.
- **A shared motion language.** Navigating between pages is a barely-there
  fade, the sidebar's active pill glides between destinations, and list items
  settle in and reflow with one shared choreography. Motion is single-layer by
  design — one calm surface, no stacked effects — and every animation respects
  reduced-motion preferences.

### Changed

- **Settings reorganized.** The settings page is regrouped into clearer
  sections; the API key field can be shown/hidden, and number fields (daily
  target, rest lengths) commit when you leave the field instead of on every
  keystroke.
- **Assistant reliability.** The tool loop got sturdier: better handling of
  provider quirks, tool-call tracing for debugging, deduplicated memory keys,
  and stream handling fixes — with substantial new test coverage.
- **Overdue is now a date fact.** A task counts as carried-over purely by its
  due date, so pausing or resuming a focus session never shuffles cards
  between groups mid-day.
- **Sharper theme.** Refined surface colors, sidebar navigation, and restored
  primary button gradients across the app.
- Toasts that carry actions (like reminders) now stay until you act on or
  dismiss them, instead of auto-dismissing after five seconds.

### Fixed

- Quick-add shortcuts saved without a real modifier (a bare "A" or a
  Shift-combo) no longer fire while you're typing in a text field.
- Shrinking the window auto-collapses Today's side panes without overwriting
  your saved layout — and they re-open on their own when the window grows
  back.
- Clearing an assistant conversation now asks for confirmation; the clear
  button sits one slot from Close, and the action is irreversible.
- The assistant's resize handle is keyboard-operable (arrows nudge, Enter
  resets) and exposes its size to screen readers.
- While the full-screen focus or rest overlay is up, the app behind it is
  inert — Tab and screen readers can no longer reach the hidden shell.

### Validation

- `yarn build` (tsc + vite), `yarn test` (96 files, 693 tests), and
  `cargo check` all pass. Smart capture, backlog views, quick-add dialog,
  tool loop, and toast behavior are unit-tested.

## 0.6.1 - 2026-07-02

### Fixed

- Windows release builds no longer open a console window alongside the app.
  Closing that console previously terminated Yolo because it was attached to
  the app's main process.

## 0.6.0 - 2026-06-29

This release is about **focus and atmosphere**. Yolo gains immersive ambient
focus scenes, a true rest mode for honest breaks, and — outside the app — a
brand-new marketing site that shows the whole product.

### Added

- **Ambient focus scenes.** Expand a running task into a full-screen focus stage
  and choose a scene — **None, Rain, Fire, or River**. The whole stage takes on
  the scene's color: the progress ring, the timer, and the controls all adopt a
  live focus accent, so the moment belongs to the scene instead of the chrome.
- **A built-in soundscape mixer.** Layer ambient sounds — **rain, fire, river,
  wind, birds, and brown noise** — each with its own volume, plus a master
  level and mute. Brown noise is synthesized, so it always works even without
  audio files; the rest stream from bundled assets.
- **Rest mode.** Take a deliberate break from the focus stage. Rest gets its own
  calmer indigo accent and a **draining** countdown ring, can be extended in
  5-minute steps, and is always tracked as rest — never disguised as a task or
  padded into your focus time. Rest sessions show up quietly in the day log.
- **Reduced-motion & performance care.** Scenes render on a single canvas loop,
  cap device pixel ratio, pause when the window is hidden, and fall back to a
  static frame when the OS prefers reduced motion.

### Changed

- The Current Focus card and full-screen focus/rest overlays now share a single
  scene-accent system (`--focus-accent`), so accent color flows consistently
  through rings, buttons, status dots, and ambient glow.
- Small assistant prompt and tool-loop refinements carried over from the AI
  work, with added test coverage.

### Project

- **New landing page.** A self-contained marketing site lives in `website/`
  (Vite + React + Tailwind + Framer Motion), mirroring the app's real design
  tokens and screens — Today, Focus, My Day, Life, Plan, Backlog, History — with
  the AI assistant and the MCP server front and center. It is independent of the
  desktop app build and deploys to Vercel; it is never bundled into the app.

### Validation

- `yarn build` (tsc + vite) and `yarn test` pass; ambient mixer, sound diffing,
  and rest-decision logic are unit-tested. The website builds with `tsc + vite`.

## 0.5.0 - 2026-06-27

This release introduces **Yolo's built-in AI assistant** — a chat companion
that helps you plan your day, make sense of your backlog, and act on your tasks,
all without leaving the app. Add an AI provider key (Anthropic, OpenAI, or
Gemini) in Settings → AI to turn it on.

### Added

- **AI assistant chat.** Talk to Yolo in plain language to plan your day, review
  your backlog, reschedule, or ask "how is today looking?". The assistant lives
  in a docked side rail you can resize, and answers stream in live so you can see
  it work through a request step by step instead of waiting for a wall of text.
- **It can actually do the work — but only with your say-so.** The assistant can
  create, edit, start, pause, complete, reschedule, and drop tasks. Every change
  shows up as a confirmation card you approve before anything happens; it never
  edits your tasks behind your back. When it proposes several changes at once you
  can **Apply all** in one click, and any change can be **undone** afterward.
- **Autonomy levels.** Choose how hands-on the assistant is from the composer or
  Settings: **Plan** (only suggests), **Ask** (confirms every change), or **Auto**
  (applies reversible changes for you and leaves the rest to confirm).
- **Conversation history.** Your chats are saved and restored across restarts.
  Keep multiple separate conversations, switch between them from the history menu,
  rename or delete them, and start a fresh thread anytime with **New chat**.
- **The assistant learns about you.** Over time it remembers your preferences,
  work style, and recurring context so its help gets more personal. You stay in
  control: open Settings → AI to review, add, edit, pin, or forget anything it has
  learned, and add an **About me** profile it reads on every turn.
- **A name and personality you set.** Give the assistant its own name and "soul"
  (tone and personality) in Settings so it feels like yours.
- **Proactive day briefing.** A glanceable banner at the top of the assistant
  shows how full your day is versus your target, so you can right-size your plan
  before you start.
- **Honest retrospectives.** The assistant can look back at your real time records
  and tell you where your estimates land versus reality, what tends to slip or get
  blocked, and a plain-language weekly review — all computed from your actual data,
  not guessed.
- **Recall over your history.** Ask about past work ("when did I last work on X?")
  and the assistant searches your logged sessions to answer.
- **Slash commands** in the chat box — `/plan`, `/today`, `/reschedule`,
  `/backlog`, and more — for one-tap shortcuts to common requests.
- **Works with your provider of choice.** Native support for Anthropic, OpenAI,
  and Gemini, including their tool-calling, with separate model choices for chat
  and for background memory work.

### Changed

- **Reminder toasts now stack into a tidy deck.** When several reminders pile up
  they collapse into a fan-out stack you can expand, with a single **Clear all**,
  instead of crowding the corner of the screen.
- Memory management moved into a dedicated dialog in Settings → AI, with inline
  add and edit alongside pin/forget/restore.

### Validation

- Ran `yarn build` (tsc + vite) and `yarn test` (581 tests across 83 files).

## 0.3.0 - 2026-06-13

### Added

- MCP server v2 — write tools. AI agents (Claude Desktop/Code, Cursor, …) can
  now manage the day, not just read it: `add_task`, `update_task`,
  `start_task`, `pause_task`, `complete_task`, `drop_task`. Every write goes
  through the app's focus-session rules (one active session, auto-pause on
  switch, continuation window, trivial-block discard) inside a SQLite
  transaction, so agent actions are indistinguishable from the user's own.
- MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`)
  on every tool, so MCP clients can apply their own approval policies.
- `YOLO_MCP_READONLY=1` runs the MCP server in the original look-but-don't-touch
  mode: write tools unregistered, database opened read-only.
- Clickable Today Log entries — open any logged session to see its details and
  edit the reflection (note, blocker, next action, completion rate).

### Changed

- The app refreshes its state whenever the window regains focus, so changes
  made by an external agent appear as soon as you come back to Yolo.

### Validation

- Ran `yarn build` (tsc + vite) and `yarn test` (56 tests).
- Ran `npm test` in `mcp/` (75 tests) and smoke-tested the built server over
  stdio in both read-write and read-only modes.

## 0.2.0 - 2026-06-08

### Added

- Full-screen "zen" focus mode: an immersive, borderless stage that hands the
  entire app window to a single running session. Enter from the expand button on
  the focus card; exit with the corner control or `Esc`.
- Animated focus ring — a soft breathing glow on the live arc and a leading
  "now" marker that rides the arc tip to mark the present moment advancing
  through your committed time. Respects `prefers-reduced-motion`.
- YOLO theme groundwork: a calm "commit moment" when a session begins, an earned
  celebration when one ends, the Life thread, and a refreshed voice across copy.

### Changed

- Collapsed the focus controls to a focused Pause + Done pair.
- Extracted the focus ring into a shared, resolution-independent component used
  by both the focus card and the new zen mode.

### Validation

- Ran `yarn build` (tsc + vite).

## 0.1.1 - 2026-06-06

### Changed

- Updated desktop packaging metadata and Windows bundle icon configuration.
- Refreshed application icon assets across desktop and mobile targets.
- Added Tauri capability coverage for global shortcut registration checks.
- Hardened global shortcut registration against duplicate registration during app startup and React StrictMode remounts.
- Switched reminder notification permission checks to the Tauri notification plugin when running in the desktop app.

### Validation

- Ran `npm run build`.
- Ran `npm run tauri -- build` and generated Windows MSI/NSIS bundles.
