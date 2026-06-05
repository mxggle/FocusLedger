# Yolo MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes your
Yolo tasks and time records to AI agents (Claude Desktop, Claude Code, Cursor, …).

It reads the **same** local `yolo.db` the desktop app uses — **read-only**, so an agent
can look at your day but cannot change your data.

## Tools

| Tool | Description |
|---|---|
| `list_tasks` | List tasks by `scope` (`today` / `backlog` / `all`), status, category, or due date |
| `get_task` | One task with its time entries and total tracked time |
| `list_time_entries` | Tracked sessions for a `date` or an explicit `start`/`end` range |
| `daily_summary` | Focus time, per-category breakdown, completed/dropped counts, estimate vs. actual |
| `list_categories` | All categories (id, name, color) |

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

Restart Claude Desktop. Ask it things like *"What did I spend my time on today?"* or
*"List my high-priority tasks for today."*

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
installs). Launch the Yolo desktop app at least once so the database exists.

## Architecture

```
src/
  config.ts            resolve the live DB path (env override → per-OS default)
  db/                  better-sqlite3 connection (read-only) + row types
  repositories/        read queries over tasks / time_entries / categories
  services/            summaryService — daily stats, mirrors the app's logic
  context.ts           Context: shared deps handed to every tool (the extension seam)
  tools/               one file per tool + a registry (tools/index.ts)
  server.ts            buildServer(ctx) — registers every tool from the registry
  index.ts             entrypoint: open DB → build context → serve over stdio
```

### Adding a tool (e.g. a future AI feature)

1. Create `src/tools/myTool.ts` exporting `defineTool({ name, title, description, inputSchema, handler })`.
2. Add it to the array in `src/tools/index.ts`.

That's it — `buildServer` registers everything in the registry. Handlers receive the
shared `Context`, so when an `ai` client is added there, new tools like `daily_debrief`
or `plan_tomorrow` can use it without touching any wiring.

## Notes

- v1 is **read-only**. Write tools (`add_task`, `start`/`stop`) are intentionally not yet
  enabled; the connection itself is opened read-only as a safety guard.
- All diagnostics go to **stderr** — stdout is reserved for the MCP protocol.
