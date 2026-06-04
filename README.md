# Yolo

**Make your time count.**

Yolo is an AI-native desktop app for people who want to take their time seriously. Write down what you want to do today, start a task with one click, let it track the time, then see exactly where your day went — and let AI help you reflect, plan, and reclaim your hours.

Your time, your data, your focus.

---

## Why Yolo

Most todo apps help you write tasks. Yolo helps you actually do them.

The real problem isn't making lists — it's not knowing when you started, how long something took, or what you actually did at the end of the day. Yolo keeps a time record so you can review and improve.

---

## Features

**Task management**
- Create tasks with category, priority, estimated time, and due date
- Start, pause, resume, stop, complete, and drop tasks
- Only one active task at a time — full focus

**Time tracking**
- Automatic timer per task session
- Stop-session notes: what you did, blockers, next steps, completion rate
- Timer state survives app restarts

**Review**
- Today view: task list + active timer + time log + daily summary
- Compare estimated vs. actual time per task
- Category totals and daily focus time
- 7-day history with per-day breakdowns
- Cross-midnight time entries split correctly

**Data**
- All data stored locally in SQLite — no network required
- Fully offline, no login needed

---

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop shell | Tauri v2 |
| UI | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Database | SQLite via `tauri-plugin-sql` |
| Utilities | date-fns, lucide-react |

---

## Getting Started

```bash
npm install
```

Run the web frontend (browser):

```bash
npm run dev
```

Run the full desktop app:

```bash
npm run tauri dev
```

---

## Build

Build the frontend:

```bash
npm run build
```

Build the desktop bundle:

```bash
npm run tauri build
```

---

## Tests

```bash
npm test
```

---

## Data Storage

All data lives in a local SQLite database (`yolo.db`) managed through Tauri's SQL plugin. React components never touch SQL directly — all data access goes through repository modules under `src/db`.

Tables: `tasks`, `time_entries`, `categories`, `settings`

---

## AI agent access (MCP)

Yolo ships an [MCP](https://modelcontextprotocol.io) server (`mcp/`) that exposes your
tasks and time records to AI agents like Claude Desktop, Claude Code, and Cursor — so you
can ask *"where did my time go today?"* from your assistant. It reads the same local
database **read-only**, so agents can look but never change your data.

```bash
cd mcp && npm install && npm run build
```

Tools: `list_tasks`, `get_task`, `list_time_entries`, `daily_summary`, `list_categories`.
See [`mcp/README.md`](mcp/README.md) for the Claude Desktop config and details.

---

## Roadmap

The core desktop workflow is done. Next is making Yolo **AI-native** — an assistant that
reads the time data you already collect and helps you reflect, plan, and reclaim hours.

- **AI time companion** — daily debrief, tomorrow planner, estimate calibration, then a
  proactive focus coach
- **AI-native capture** — natural-language quick-add and smart stop-notes
- **MCP integration** — let external AI agents read and act on your tasks and time records
- **Desktop foundations** — system tray, global shortcuts, mini floating timer, notifications

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full phased plan and the open decision on
where the AI runs.
