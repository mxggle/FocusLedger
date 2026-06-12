# Yolo MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents
(Claude Desktop, Claude Code, Cursor, …) read **and manage** your Yolo tasks and time
records. It works on the **same** local `yolo.db` the desktop app uses, and every write
goes through the app's business rules — one focus session at a time, auto-pause on
switch, trivial blocks discarded — so agent actions are indistinguishable from your own.

## Tools

### Read

| Tool | Description |
|---|---|
| `list_tasks` | List tasks by `scope` (`today` / `backlog` / `all`), status, category, or due date |
| `get_task` | One task with its time entries and total tracked time |
| `list_time_entries` | Tracked sessions for a `date` or an explicit `start`/`end` range |
| `daily_summary` | Focus time, per-category breakdown, completed/dropped counts, estimate vs. actual |
| `list_categories` | All categories (id, name, color) |

### Write

| Tool | Description |
|---|---|
| `add_task` | Create a task (defaults: due today, medium priority, `inbox` category; `due_date: "none"` → backlog) |
| `update_task` | Edit title, description, category, priority, estimate, due date, or planned times |
| `start_task` | Start/resume a focus session — auto-pauses whatever is running |
| `pause_task` | Pause the running session |
| `complete_task` | Mark done; stops a running session and saves a reflection (note / blocker / next action / completion rate) |
| `drop_task` | Mark dropped, optionally recording why |

Every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`, …) so clients can
apply their own approval policies.

### Read-only mode

Set `YOLO_MCP_READONLY=1` to run the server in the original look-but-don't-touch mode:
write tools are not registered and the database connection is opened read-only.

## Setup

```bash
cd mcp
npm install
npm run build      # compiles to dist/
npm test           # run the suite
```

### Connect to Claude Desktop

Add this to your Claude Desktop config
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "yolo": {
      "command": "node",
      "args": ["/absolute/path/to/goal/mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. Ask it things like *"What did I spend my time on today?"*,
*"Add a task to prep the demo for Friday, about an hour"*, or *"Start the focus timer
on the report."*

The same `command`/`args` work for any MCP client (Claude Code, Cursor, etc.).

## Database location

By default the server reads Yolo's database from the platform app-config directory for
`com.yolo.desktop`:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/com.yolo.desktop/yolo.db` |
| Linux | `$XDG_CONFIG_HOME/com.yolo.desktop/yolo.db` (or `~/.config/...`) |
| Windows | `%APPDATA%\com.yolo.desktop\yolo.db` |

Override with the `YOLO_DB_PATH` environment variable (useful for testing or non-default
installs). Launch the Yolo desktop app at least once so the database exists — the server
never creates or migrates it.

## Concurrency with the desktop app

The database is kept in WAL mode by the app, so the server and the app can work on it at
the same time; each side waits out the other's short write locks (`busy_timeout`). The
app refreshes its view whenever its window regains focus, so changes made by an agent
appear as soon as you come back to Yolo.

## Architecture

```
src/
  config.ts            resolve the live DB path + read-only mode from the environment
  db/                  better-sqlite3 connection + row types
  repositories/        queries and mutations over tasks / time_entries / categories
  services/            summaryService — daily stats; sessionService — focus-session rules
  context.ts           Context: shared deps handed to every tool (the extension seam)
  tools/               one file per tool + a registry (tools/index.ts)
  server.ts            buildServer(ctx, { readonly }) — registers tools from the registry
  index.ts             entrypoint: open DB → build context → serve over stdio
```

Business rules live in `sessionService` and mirror the desktop app's `taskStore`
exactly: only one session runs at a time, starting a task auto-pauses the previous one,
restarting within 3 minutes continues the previous block instead of fragmenting the log,
and closed blocks under 30 seconds with no reflection are discarded. Each write tool
runs its mutations inside a single SQLite transaction.

### Adding a tool (e.g. a future AI feature)

1. Create `src/tools/myTool.ts` exporting `defineTool({ name, title, description, inputSchema, handler })`.
   Mark it `writes: true` if it mutates the database, and give it honest `annotations`.
2. Add it to the array in `src/tools/index.ts`.

That's it — `buildServer` registers everything in the registry. Handlers receive the
shared `Context`, so when an `ai` client is added there, new tools like `daily_debrief`
or `plan_tomorrow` can use it without touching any wiring.

## Notes

- Status changes go through the dedicated tools (`start_task`, `pause_task`,
  `complete_task`, `drop_task`), not `update_task` — that keeps every transition on the
  app's rules (timestamps, session handling).
- All diagnostics go to **stderr** — stdout is reserved for the MCP protocol.
