# Yolo

Turn tasks into time records.

Yolo is a local-first desktop todo and time tracking app. It helps you write down today's work, start a focus session, record the real execution time, and review where the day went.

## Tech Stack

- Tauri v2
- React
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- SQLite through `tauri-plugin-sql`
- date-fns
- lucide-react

## Local Development

Install dependencies:

```bash
npm install
```

Run the web frontend:

```bash
npm run dev
```

Run the desktop app:

```bash
npm run tauri dev
```

Build the frontend:

```bash
npm run build
```

Build the desktop bundle:

```bash
npm run tauri build
```

Run tests:

```bash
npm test
```

## Features

- Create today tasks with category, priority, estimate, and due date
- Start, pause, resume, stop, complete, drop, edit, and delete tasks
- Keep only one active time entry at a time
- Restore active timer state from SQLite after app restart
- Save stop-session notes, blockers, next actions, and completion rate
- Show Today task list, active focus timer, time log, and summary
- Compare estimated time with actual focus time
- Split cross-day time entries correctly in stats
- Show recent history and daily category totals
- Store basic preferences locally

## Data Storage

All product data is stored in a local SQLite database named `yolo.db` through Tauri's SQL plugin. React components never run SQL directly; they call repository modules under `src/db`.

Tables:

- `tasks`
- `time_entries`
- `categories`
- `settings`

## Roadmap

The current implementation covers the core P0 desktop workflow. The next iteration should add system tray behavior, configurable global shortcuts, a mini timer window, and desktop notifications.
