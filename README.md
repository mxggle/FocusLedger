<div align="center">
  <img src="docs/logo.png" alt="Yolo Logo" width="120" />

  <h1>Yolo</h1>

  <p><strong>Make your time count.</strong></p>

  <p>
    An AI-native desktop productivity app that turns your tasks into time records —<br/>
    so you always know where your day actually went.
  </p>

  <p>
    <img src="https://img.shields.io/badge/version-0.1.0-blue?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform" />
    <img src="https://img.shields.io/badge/built%20with-Tauri%20v2-24C8DB?style=flat-square&logo=tauri" alt="Tauri" />
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/offline%20first-SQLite-003B57?style=flat-square&logo=sqlite" alt="SQLite" />
    <img src="https://img.shields.io/badge/MCP-enabled-8B5CF6?style=flat-square" alt="MCP" />
  </p>

  <br/>
</div>

---

## ✨ Why Yolo?

Most productivity apps help you **write** tasks. Yolo helps you **do** them — and understand how long they truly take.

The real problem isn't making lists. It's not knowing when you started, how long something took, or what you actually accomplished at the end of the day. Yolo keeps a precise time record, so you can **review, reflect, and improve**.

> **Your time. Your data. Your focus.** — 100% local, zero cloud, zero tracking.

---

## 🚀 Features

### 🗂 Task Management
- Create tasks with **category, priority, estimated time**, and due date
- Full lifecycle: **start → pause → resume → stop → complete** (or drop)
- **One active task at a time** — eliminate multitasking noise

### ⏱ Time Tracking
- Automatic per-session timer that **survives app restarts**
- Stop-session notes: _what you did, blockers, next steps, completion rate_
- Accurate cross-midnight time entry splitting

### 📊 Daily Review
- **Today view** — task list + live timer + time log + daily summary
- Compare **estimated vs. actual** time per task
- Category totals and daily focus time at a glance
- **7-day history** with per-day breakdowns

### 🤖 AI-Native (MCP)
- Ships an **MCP server** that exposes your tasks and time records to AI agents
- Works with **Claude Desktop, Claude Code, Cursor**, and any MCP-compatible tool
- Ask _"where did my time go today?"_ directly from your AI assistant
- Read-only — agents can look, but **never modify** your data

### 🔒 Privacy First
- All data stored **locally in SQLite** — no account, no network, no sync
- Fully offline, always under your control

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| 🖥 Desktop Shell | [Tauri v2](https://tauri.app) (Rust) |
| ⚛️ UI Framework | React 18 + TypeScript + Vite |
| 🎨 Styling | Tailwind CSS + Radix UI |
| 🐻 State Management | Zustand |
| 🗄 Database | SQLite via `tauri-plugin-sql` |
| 🎞 Animation | Framer Motion |
| 🔧 Utilities | date-fns, lucide-react |
| 🤖 AI Integration | MCP (Model Context Protocol) |

---

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) (for Tauri)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) for your OS

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/yolo.git
cd yolo

# Install dependencies
npm install
```

### Running

```bash
# Run the web frontend only (browser, no Tauri)
npm run dev

# Run the full desktop app (recommended)
npm run tauri dev
```

### Building

```bash
# Build the frontend bundle
npm run build

# Build the native desktop app (distributable)
npm run tauri build
```

---

## 🧪 Tests

```bash
# Run all tests once
npm test

# Run in watch mode
npm run test:watch
```

---

## 🗄 Data Storage

All data lives in a local SQLite database (`yolo.db`) managed through Tauri's SQL plugin.

React components **never touch SQL directly** — all data access goes through repository modules in [`src/db/`](src/db/).

**Schema:**

| Table | Purpose |
|---|---|
| `tasks` | Task definitions, status, estimates |
| `time_entries` | Per-session time records |
| `categories` | User-defined task categories |
| `settings` | App preferences and theme |

---

## 🤖 AI Agent Access (MCP)

Yolo ships a standalone [MCP](https://modelcontextprotocol.io) server in [`mcp/`](mcp/) that exposes your tasks and time records to any MCP-compatible AI agent.

```bash
cd mcp && npm install && npm run build
```

**Available tools:**

| Tool | Description |
|---|---|
| `list_tasks` | List tasks with optional filters |
| `get_task` | Get a single task by ID |
| `list_time_entries` | List time records, filter by date or task |
| `daily_summary` | Get a summary of a specific day |
| `list_categories` | List all categories |

See [`mcp/README.md`](mcp/README.md) for the full Claude Desktop config and integration details.

---

## 🗺 Roadmap

The core desktop workflow is complete. The next phase makes Yolo truly **AI-native**.

- [ ] 🧠 **AI time companion** — daily debrief, tomorrow planner, estimate calibration, proactive focus coach
- [ ] 💬 **AI-native capture** — natural-language quick-add and smart stop-notes
- [ ] 🔌 **MCP write tools** — let agents create and update tasks on your behalf
- [ ] 🖥 **Desktop power features** — system tray, global shortcuts, mini floating timer, notifications

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full phased plan and architecture decisions.

---

## 📁 Project Structure

```
yolo/
├── src/                    # React frontend
│   ├── components/         # UI components (layout, pages, primitives)
│   ├── db/                 # Repository layer (all SQL access)
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand state stores
│   ├── types/              # Shared TypeScript types
│   └── utils/              # Helper utilities
├── src-tauri/              # Tauri (Rust) backend
│   ├── src/                # Rust source
│   └── icons/              # App icons (all sizes)
├── mcp/                    # MCP server for AI agent access
└── docs/                   # Documentation and roadmap
```

---

## 🤝 Contributing

Contributions are welcome! Please open an issue to discuss what you'd like to change before submitting a pull request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feat/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feat/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is private. All rights reserved.

---

<div align="center">
  <sub>Built with ❤️ using <a href="https://tauri.app">Tauri</a>, <a href="https://react.dev">React</a>, and a deep respect for your time.</sub>
</div>
