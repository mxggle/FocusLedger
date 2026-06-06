# CLAUDE.md — Yolo

Project-specific instructions for this repo. These override general defaults.

## Product positioning (IMPORTANT)

**Yolo is an AI-native desktop productivity app.** Its value is helping people
*do* their tasks and understand where their time actually goes — turning tasks
into honest time records. The throughline is **"Make your time count"**: plan
the day, run one focus, review the truth.

**Local-first / privacy is NOT the product's intention or selling point.**
- Do not position, market, or design Yolo around "local-first," "private by
  design," "your data never leaves your device," or similar privacy framing.
- It is fine that data currently happens to be stored on-device — but do not
  elevate that into a feature, headline, or marketing claim.
- When you encounter such framing (UI copy, README, marketing, About page),
  remove or rewrite it rather than reinforcing it.
- The strategic direction is **AI-native** (see the MCP server under `mcp/`),
  not privacy/offline.

## Tech context

- Tauri v2 (Rust shell) + React 18 + TypeScript + Vite + Tailwind.
- Zustand stores, Radix primitives, framer-motion, lucide-react icons.
- Simple state-based routing in `src/App.tsx` (no router lib).
- Open external links via `src/utils/openExternal.ts` (Tauri opener plugin).
- Verify with `yarn build` (tsc + vite), `yarn test` (vitest), and
  `cargo check` inside `src-tauri/` for Rust changes.
