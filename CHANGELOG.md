# Changelog

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
