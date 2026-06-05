import { beforeEach, describe, expect, it } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { createContext, type Context } from "../src/context.js";
import { listTasksTool } from "../src/tools/listTasks.js";
import { getTaskTool } from "../src/tools/getTask.js";
import { listTimeEntriesTool } from "../src/tools/listTimeEntries.js";
import { dailySummaryTool } from "../src/tools/dailySummary.js";
import { listCategoriesTool } from "../src/tools/listCategories.js";
import { toolModules } from "../src/tools/index.js";
import { createTestDb, insertCategory, insertEntry, insertTask } from "./helpers/db.js";

function payload(result: CallToolResult): any {
  const first = result.content[0] as { type: string; text: string };
  return JSON.parse(first.text);
}

const at = (h: number, m = 0) => new Date(2026, 5, 4, h, m, 0).toISOString();

describe("tools", () => {
  let db: SqliteDatabase;
  let ctx: Context;

  beforeEach(() => {
    db = createTestDb();
    insertCategory(db, { id: "dev", name: "Development", color: "#7c3aed" });
    insertTask(db, { id: "t1", title: "Build MCP", category_id: "dev", due_date: "2026-06-04", estimated_minutes: 60 });
    insertEntry(db, { id: "e1", task_id: "t1", start_at: at(9), end_at: at(10), duration_seconds: 3600, note: "good" });
    ctx = createContext(db);
  });

  it("every registered tool has a unique name", () => {
    const names = toolModules.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining(["list_tasks", "get_task", "list_time_entries", "daily_summary", "list_categories"])
    );
  });

  it("list_tasks returns tasks with a count", async () => {
    const data = payload(await listTasksTool.handler({ scope: "all" }, ctx));
    expect(data.count).toBe(1);
    expect(data.tasks[0].id).toBe("t1");
  });

  it("get_task includes entries and tracked time", async () => {
    const data = payload(await getTaskTool.handler({ id: "t1" }, ctx));
    expect(data.task.id).toBe("t1");
    expect(data.timeEntries).toHaveLength(1);
    expect(data.trackedSeconds).toBe(3600);
    expect(data.trackedMinutes).toBe(60);
  });

  it("get_task returns an error result for unknown ids", async () => {
    const result = await getTaskTool.handler({ id: "nope" }, ctx);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("nope");
  });

  it("list_time_entries works with a date", async () => {
    const data = payload(await listTimeEntriesTool.handler({ date: "2026-06-04" }, ctx));
    expect(data.count).toBe(1);
    expect(data.entries[0].id).toBe("e1");
  });

  it("list_time_entries rejects a bad date", async () => {
    const result = await listTimeEntriesTool.handler({ date: "06/04/2026" }, ctx);
    expect(result.isError).toBe(true);
  });

  it("list_time_entries requires date or start+end", async () => {
    const result = await listTimeEntriesTool.handler({}, ctx);
    expect(result.isError).toBe(true);
  });

  it("daily_summary defaults are valid and reflect the data", async () => {
    const data = payload(await dailySummaryTool.handler({ date: "2026-06-04" }, ctx));
    expect(data.totalFocusSeconds).toBe(3600);
    expect(data.estimatedMinutes).toBe(60);
  });

  it("list_categories returns seeded categories", async () => {
    const data = payload(await listCategoriesTool.handler({}, ctx));
    expect(data.count).toBe(1);
    expect(data.categories[0].id).toBe("dev");
  });
});
