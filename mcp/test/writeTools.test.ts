import { beforeEach, describe, expect, it } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { createContext, type Context } from "../src/context.js";
import { addTaskTool } from "../src/tools/addTask.js";
import { updateTaskTool } from "../src/tools/updateTask.js";
import { startTaskTool } from "../src/tools/startTask.js";
import { pauseTaskTool } from "../src/tools/pauseTask.js";
import { completeTaskTool } from "../src/tools/completeTask.js";
import { dropTaskTool } from "../src/tools/dropTask.js";
import { toolModules, toolModulesFor } from "../src/tools/index.js";
import { toDateKey } from "../src/util/date.js";
import { createTestDb, insertCategory, insertTask } from "./helpers/db.js";

function payload(result: CallToolResult): any {
  const first = result.content[0] as { type: string; text: string };
  return JSON.parse(first.text);
}

describe("write tools", () => {
  let db: SqliteDatabase;
  let ctx: Context;

  beforeEach(() => {
    db = createTestDb();
    insertCategory(db, { id: "inbox", name: "Inbox" });
    insertCategory(db, { id: "dev", name: "Development", color: "#7c3aed" });
    insertTask(db, { id: "t1", title: "Existing task", category_id: "dev", due_date: "2026-06-11" });
    ctx = createContext(db);
  });

  describe("registry", () => {
    it("registers all read and write tools", () => {
      const names = toolModules.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "add_task",
          "update_task",
          "start_task",
          "pause_task",
          "complete_task",
          "drop_task"
        ])
      );
    });

    it("read-only mode strips every writing tool", () => {
      const readonlyNames = toolModulesFor({ readonly: true }).map((t) => t.name);
      expect(readonlyNames).toEqual([
        "list_tasks",
        "get_task",
        "list_time_entries",
        "daily_summary",
        "list_categories"
      ]);
    });

    it("write tools are marked and read tools are annotated read-only", () => {
      for (const tool of toolModules) {
        if (tool.writes) {
          expect(tool.annotations?.readOnlyHint).toBe(false);
        } else {
          expect(tool.annotations?.readOnlyHint).toBe(true);
        }
      }
    });
  });

  describe("add_task", () => {
    it("creates a task with app defaults (today, inbox, todo)", async () => {
      const data = payload(await addTaskTool.handler({ title: "Write the report", priority: "medium" }, ctx));

      expect(data.task.id).toMatch(/^task_/);
      expect(data.task.status).toBe("todo");
      expect(data.task.category_id).toBe("inbox");
      expect(data.task.due_date).toBe(toDateKey());
      expect(ctx.tasks.getById(data.task.id)?.title).toBe("Write the report");
    });

    it("sends due_date 'none' to the backlog", async () => {
      const data = payload(
        await addTaskTool.handler({ title: "Someday", priority: "low", due_date: "none" }, ctx)
      );
      expect(data.task.due_date).toBeNull();
    });

    it("rejects an unknown category and lists valid ids", async () => {
      const result = await addTaskTool.handler({ title: "x", priority: "medium", category_id: "nope" }, ctx);
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain("dev");
    });

    it("rejects a malformed due_date", async () => {
      const result = await addTaskTool.handler({ title: "x", priority: "medium", due_date: "06/11/2026" }, ctx);
      expect(result.isError).toBe(true);
    });
  });

  describe("update_task", () => {
    it("changes only the passed fields", async () => {
      const data = payload(
        await updateTaskTool.handler({ id: "t1", title: "Renamed", estimated_minutes: 45 }, ctx)
      );
      expect(data.task.title).toBe("Renamed");
      expect(data.task.estimated_minutes).toBe(45);
      expect(data.task.category_id).toBe("dev");
    });

    it("moves a task to the backlog with due_date null", async () => {
      const data = payload(await updateTaskTool.handler({ id: "t1", due_date: null }, ctx));
      expect(data.task.due_date).toBeNull();
    });

    it("rejects an unknown task", async () => {
      const result = await updateTaskTool.handler({ id: "ghost", title: "x" }, ctx);
      expect(result.isError).toBe(true);
    });

    it("rejects an empty patch", async () => {
      const result = await updateTaskTool.handler({ id: "t1" }, ctx);
      expect(result.isError).toBe(true);
    });

    it("rejects an unknown category", async () => {
      const result = await updateTaskTool.handler({ id: "t1", category_id: "ghost" }, ctx);
      expect(result.isError).toBe(true);
    });
  });

  describe("focus session tools", () => {
    it("start_task begins a session and reports the new entry", async () => {
      const data = payload(await startTaskTool.handler({ task_id: "t1" }, ctx));
      expect(data.task.status).toBe("doing");
      expect(data.entry.end_at).toBeNull();
      expect(data.pausedTaskId).toBeNull();
    });

    it("start_task auto-pauses the previous task", async () => {
      insertTask(db, { id: "t2", title: "Other", due_date: "2026-06-11" });
      await startTaskTool.handler({ task_id: "t1" }, ctx);
      const data = payload(await startTaskTool.handler({ task_id: "t2" }, ctx));

      expect(data.pausedTaskId).toBe("t1");
      expect(ctx.tasks.getById("t1")?.status).toBe("paused");
    });

    it("start_task refuses a finished task", async () => {
      insertTask(db, { id: "done1", title: "Done", status: "done" });
      const result = await startTaskTool.handler({ task_id: "done1" }, ctx);
      expect(result.isError).toBe(true);
    });

    it("start_task refuses an unknown task", async () => {
      const result = await startTaskTool.handler({ task_id: "ghost" }, ctx);
      expect(result.isError).toBe(true);
    });

    it("pause_task reports when nothing is running", async () => {
      const data = payload(await pauseTaskTool.handler({}, ctx));
      expect(data.paused).toBe(false);
    });

    it("pause_task pauses the running session", async () => {
      await startTaskTool.handler({ task_id: "t1" }, ctx);
      const data = payload(await pauseTaskTool.handler({}, ctx));
      expect(data.paused).toBe(true);
      expect(data.task.status).toBe("paused");
    });

    it("complete_task stops the session and stores the reflection", async () => {
      await startTaskTool.handler({ task_id: "t1" }, ctx);
      const data = payload(
        await completeTaskTool.handler({ task_id: "t1", note: "all done", completion_rate: 90 }, ctx)
      );

      expect(data.task.status).toBe("done");
      expect(data.entry.note).toBe("all done");
      expect(data.entry.completion_rate).toBe(90);
      expect(data.entry.end_at).not.toBeNull();
    });

    it("complete_task works without a running session", async () => {
      const data = payload(await completeTaskTool.handler({ task_id: "t1" }, ctx));
      expect(data.task.status).toBe("done");
      expect(data.entry).toBeNull();
    });

    it("drop_task marks the task dropped with the reason", async () => {
      await startTaskTool.handler({ task_id: "t1" }, ctx);
      const data = payload(await dropTaskTool.handler({ task_id: "t1", blocker: "deprioritised" }, ctx));

      expect(data.task.status).toBe("dropped");
      expect(data.task.dropped_at).not.toBeNull();
      expect(data.entry.blocker).toBe("deprioritised");
    });

    it("finishing tools reject unknown tasks", async () => {
      expect((await completeTaskTool.handler({ task_id: "ghost" }, ctx)).isError).toBe(true);
      expect((await dropTaskTool.handler({ task_id: "ghost" }, ctx)).isError).toBe(true);
    });
  });
});
