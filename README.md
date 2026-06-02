# Yolo

**Turn tasks into time records.**

Yolo is a local-first desktop app that closes the loop between planning and execution. Write down what you want to do today, start a task with one click, let it track the time, then see exactly where your day went.

No accounts. No sync. No subscriptions. Just you and your time.

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

## Roadmap

The core desktop workflow is done. Next:

- System tray with quick-start
- Global keyboard shortcuts
- Mini floating timer window
- Desktop notifications
