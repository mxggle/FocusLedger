# Yolo Roadmap

**North star:** make Yolo *AI-native* — not a chatbot bolted onto a todo app, but an
assistant that reads the structured time data Yolo already collects (`tasks`,
`time_entries` with stop-notes, `categories`, `schedules`, life-weeks) and helps you
reflect, plan, and reclaim your hours.

The core desktop workflow (capture → track → review) is done. What follows is sequenced
roughly by value and dependency: each AI tier builds on the one before it.

---

## Track A — AI time companion

### Phase 1 · Reflection layer _(build first)_
The highest-value use of data we already have. Read-only AI over existing records — low
UI risk, no new capture flow.

- **Daily debrief (shipped)** — at day's end, summarize where time actually went from
  `time_entries` + stop-notes: estimate-vs-actual gaps, recurring blockers, one concrete
  thing to change tomorrow. Lives in the Today Log pane; one debrief per day, saved to
  `daily_debriefs` so a reviewable journal accumulates. Built on a provider-agnostic AI
  layer (`src/services/ai/`) that the rest of Phase 1–3 reuses.
- **Tomorrow planner** — propose tomorrow's list from backlog + due dates, sized to your
  *real* capacity (average focus hours actually logged), not an idealized schedule.
- **Estimate calibration** — learn your personal fudge factor per category
  ("coding tasks run 1.6× your estimate") and suggest corrected estimates.
- **Weekly / monthly review** — patterns over time: which categories eat the week, when
  focus peaks, what keeps getting dropped.

### Phase 2 · AI-native capture
Make input feel AI-native. Highest day-to-day "this is different" payoff.

- **Natural-language quick-add** — "finish the deck for Thursday, ~2h, high priority"
  parses into a structured task (category, estimate, due date, priority).
- **Brain-dump → tasks** — paste/speak a messy paragraph; split into discrete tasks.
- **Smart stop-notes** — draft "what I did / blockers / next steps" from a one-line prompt
  when a session stops.

### Phase 3 · Proactive coach _(needs Phase 1 underneath)_
AI nudges and light actions. Highest "wow," but only credible once reflection works.

- **Focus coach** — notice running 90 min past estimate or heavy context-switching, nudge.
- **Overcommit warning** — flag "11h of work planned in an 8h day" before you start.
- **Auto-reschedule** — task slipped past due date → propose where it fits next.
- **Time-leak detection** — surface untracked gaps and ask what happened, turning them
  into entries.

---

## Track B — Agent-native (MCP)

- **MCP server (v1 — shipped, read-only)** — a standalone server (`mcp/`) exposes tasks
  and time records as MCP tools so external agents (Claude Desktop/Code, Cursor, …) can
  read your day. Tools: `list_tasks`, `get_task`, `list_time_entries`, `daily_summary`,
  `list_categories`. See [`../mcp/README.md`](../mcp/README.md) for setup.
  - Built on a tool-registry + `Context` seam so new tools (including the AI features
    above) drop in as one file — the same extension point future work plugs into.
- **MCP server (v2 — shipped) — write tools** — agents can now manage the day:
  `add_task`, `update_task`, `start_task`, `pause_task`, `complete_task`, `drop_task`,
  all behind the app's business rules (one active session, auto-pause on switch,
  continuation window, trivial-block discard) via a shared `sessionService`. The app
  refreshes on window focus so agent changes appear immediately; `YOLO_MCP_READONLY=1`
  restores look-but-don't-touch mode.
- **Life-weeks meaning layer** — connect daily time data to the big picture:
  "at this rate you'll spend ~X weeks of your remaining life in meetings."

---

## Track C — Desktop UX foundations

These run in parallel with the AI work — they make Yolo a first-class desktop citizen.

- System tray with quick-start
- Global keyboard shortcuts
- Mini floating timer window
- Desktop notifications

---

## Design decision · how AI is delivered — RESOLVED

**BYO API key, multi-provider.** Settings → AI lets the user pick Claude (Anthropic),
OpenAI, Google Gemini, or any OpenAI-compatible endpoint (covers Ollama, Groq, DeepSeek,
LM Studio, …) and paste their own key. Requests go through `tauri-plugin-http` (Rust
proxies the call, so provider CORS policies don't apply). No backend, zero server cost.
Features degrade gracefully when no key is set — the debrief card explains how to connect
a provider instead of erroring.
