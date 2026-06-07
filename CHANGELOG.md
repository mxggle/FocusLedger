# Changelog

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
