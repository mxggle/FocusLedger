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

## AI assistant & retrospective layer

- The in-app assistant lives in `src/services/ai/assistant/` (context builder →
  system prompt → runner), with state in `src/stores/assistantStore.ts` and UI
  in `src/components/assistant/`. It is **propose-then-confirm**: it proposes
  task changes the user approves; it never mutates tasks directly.
- Retrospective analytics live in `src/services/retrospect/` — pure functions
  computing estimate-vs-actual **calibration**, **slip/blocker** analysis, and a
  **weekly review** from time entries + tasks, orchestrated by
  `buildRetrospectiveInsights()`. `loadHistory.ts` is the only DB-touching file.
- **Invariant:** all numbers are computed deterministically in TypeScript and
  only *narrated* by the LLM — never ask the model to do math on raw rows.
  Insights are additive: with no history, the prompt and behavior are unchanged.
