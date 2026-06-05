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

- **Daily debrief** — at day's end, summarize where time actually went from `time_entries`
  + stop-notes: estimate-vs-actual gaps, recurring blockers, one concrete thing to change
  tomorrow.
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

## Track B — Agent-readable (MCP)

- **MCP server (v1 — shipped, read-only)** — a standalone server (`mcp/`) exposes tasks
  and time records as MCP tools so external agents (Claude Desktop/Code, Cursor, …) can
  read your day. It reads the same `yolo.db` read-only — agents can look, not touch.
  Tools: `list_tasks`, `get_task`, `list_time_entries`, `daily_summary`, `list_categories`.
  See [`../mcp/README.md`](../mcp/README.md) for setup.
  - Built on a tool-registry + `Context` seam so new tools (including the AI features
    above) drop in as one file — the same extension point future work plugs into.
- **MCP server (v2 — next) — write tools** — `add_task`, `start`/`stop`, complete/drop,
  behind the app's business rules (one active task, etc.). Connection opens read-write
  only here.
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

## Open design decision · where AI runs

AI breaks the current "fully offline, no network required" promise, so the delivery model
must be settled before Phase 1 ships. Options under consideration:

- **BYO API key (cloud)** — user supplies their own Claude/OpenAI key. Best quality, zero
  server cost, no backend. Most pragmatic for a local desktop app.
- **Local model (Ollama)** — on-device, keeps the offline guarantee. Private but heavier,
  weaker results, large install.
- **Hybrid** — local for cheap parsing (e.g. quick-add), cloud for deep reasoning
  (debrief, planning). Most flexible, most complexity.

Likely direction: BYO key first, with capture-only features degrading gracefully when no
key is set, so the offline core keeps working.
