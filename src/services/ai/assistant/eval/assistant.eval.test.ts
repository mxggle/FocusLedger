import { describe, expect, it } from "vitest";
import {
  ALL_TOOL_NAMES,
  containsSubsequence,
  replyHasInternalIds,
  replyHasToolNames,
  runEval,
  toolCallNames
} from "./harness";
import {
  backlogTask,
  FIXED_OVERDUE,
  FIXED_TODAY,
  makeCategory,
  makeTask,
  todayScheduledTask,
  todaySecondTask
} from "./fixtures";

function rawReplyCallsTool(rawReplies: string[], name: string): boolean {
  return rawReplies.some((reply) => reply.includes(`"name":"${name}"`));
}

function expectSanitizedReply(reply: string): void {
  expect(reply.trim().length).toBeGreaterThan(0);
  expect(replyHasInternalIds(reply)).toBe(false);
  expect(replyHasToolNames(reply)).toBe(false);
}

describe("eval #1 — delay every task today by 30 minutes", () => {
  it("calls list_tasks then update_task per scheduled task, never create_task", async () => {
    const t1 = todayScheduledTask({ id: "task-today-1" });
    const t2 = todaySecondTask({ id: "task-today-2" });
    const backlog = backlogTask({ id: "task-backlog-1", title: "Someday idea" });
    const overdue = makeTask({ id: "task-overdue-1", title: "Overdue report", due_date: FIXED_OVERDUE, planned_start_time: "08:00" });

    const { reply, records, store, rawReplies } = await runEval({
      prompt: "Delay every task today by 30 minutes.",
      fixture: {
        today: FIXED_TODAY,
        tasks: [t1, t2],
        backlogTasks: [backlog],
        categories: [makeCategory({ id: "cat-dev", name: "Dev" })],
        allTasks: [t1, t2, backlog, overdue]
      },
      replies: [
        '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}}]}',
        '{"tool_calls":[{"name":"update_task","args":{"task_id":"task-today-1","planned_start_time":"09:30","planned_end_time":"10:00"}},{"name":"update_task","args":{"task_id":"task-today-2","planned_start_time":"10:30","planned_end_time":"11:30"}}]}',
        "Delayed both scheduled tasks by 30 minutes."
      ]
    });

    expect(rawReplyCallsTool(rawReplies, "list_tasks")).toBe(true);
    expect(toolCallNames(records)).toEqual(["update_task", "update_task"]);
    expect(records.every((record) => record.name !== "create_task")).toBe(true);
    expect(records.every((record) => record.status === "executed")).toBe(true);

    expect(store.callsByMethod("createTask")).toHaveLength(0);
    expect(store.callsByMethod("updateTask")).toHaveLength(2);
    expect(store.callsByMethod("updateTask")[0].args).toEqual(["task-today-1", { planned_start_time: "09:30", planned_end_time: "10:00" }]);
    expect(store.callsByMethod("updateTask")[1].args).toEqual(["task-today-2", { planned_start_time: "10:30", planned_end_time: "11:30" }]);

    expect(store.taskById("task-backlog-1")?.due_date).toBeNull();
    expect(store.taskById("task-overdue-1")?.planned_start_time).toBe("08:00");
    expect(store.taskById("task-today-1")?.planned_start_time).toBe("09:30");

    expectSanitizedReply(reply);
  });
});

describe("eval #4 — start the most important task now", () => {
  it("starts the high-priority open task and creates nothing", async () => {
    const high = todayScheduledTask({ id: "task-high-1", title: "Launch deck", priority: "high" });
    const medium = todaySecondTask({ id: "task-med-1", title: "Email Ken", priority: "medium" });
    const low = makeTask({ id: "task-low-1", title: "Admin", priority: "low", due_date: FIXED_TODAY });

    const { reply, records, store, rawReplies } = await runEval({
      prompt: "Start the most important task now.",
      fixture: {
        today: FIXED_TODAY,
        tasks: [high, medium, low],
        allTasks: [high, medium, low]
      },
      replies: [
        '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}}]}',
        '{"tool_calls":[{"name":"start_task","args":{"task_id":"task-high-1"}}]}',
        "Started Launch deck."
      ]
    });

    expect(rawReplyCallsTool(rawReplies, "list_tasks")).toBe(true);
    expect(containsSubsequence(toolCallNames(records), ["start_task"])).toBe(true);
    expect(records.find((record) => record.name === "start_task")?.status).toBe("executed");
    expect(records.every((record) => record.name !== "create_task")).toBe(true);

    expect(store.callsByMethod("startTask")).toEqual([{ method: "startTask", args: ["task-high-1"] }]);
    expect(store.callsByMethod("createTask")).toHaveLength(0);
    expect(store.taskById("task-high-1")?.status).toBe("doing");
    expect(store.taskById("task-med-1")?.status).toBe("todo");
    expect(store.taskById("task-low-1")?.status).toBe("todo");

    expectSanitizedReply(reply);
  });
});

describe("eval #9 — drop all low-priority backlog tasks (destructive)", () => {
  it("queues drop_task as pending in auto mode and mutates nothing", async () => {
    const low1 = backlogTask({ id: "task-low-a", title: "Old idea A", priority: "low" });
    const low2 = backlogTask({ id: "task-low-b", title: "Old idea B", priority: "low" });
    const medium = backlogTask({ id: "task-med-c", title: "Keep me", priority: "medium" });

    const { reply, records, store, rawReplies } = await runEval({
      prompt: "Drop all low-priority backlog tasks.",
      fixture: {
        today: FIXED_TODAY,
        tasks: [],
        backlogTasks: [low1, low2, medium],
        allTasks: [low1, low2, medium],
        permissionLevel: "auto"
      },
      replies: [
        '{"tool_calls":[{"name":"list_tasks","args":{"scope":"backlog"}}]}',
        '{"tool_calls":[{"name":"drop_task","args":{"task_id":"task-low-a"}},{"name":"drop_task","args":{"task_id":"task-low-b"}}]}',
        "Queued two low-priority backlog tasks to drop — confirm to apply."
      ]
    });

    expect(rawReplyCallsTool(rawReplies, "list_tasks")).toBe(true);
    expect(toolCallNames(records)).toEqual(["drop_task", "drop_task"]);
    expect(records.every((record) => record.status === "pending")).toBe(true);
    expect(records.every((record) => record.destructive)).toBe(true);
    expect(records.every((record) => record.name !== "create_task")).toBe(true);

    expect(store.callsByMethod("dropTask")).toHaveLength(0);
    expect(store.callsByMethod("createTask")).toHaveLength(0);
    expect(store.taskById("task-low-a")?.status).toBe("todo");
    expect(store.taskById("task-low-b")?.status).toBe("todo");
    expect(store.taskById("task-med-c")?.status).toBe("todo");

    expect(reply.toLowerCase()).toContain("confirm");
    expectSanitizedReply(reply);
  });
});

describe("eval #10 — create a task that says 'delay every task by 30 minutes' (literal-only)", () => {
  it("creates a single literal task and does not bulk-reschedule existing tasks", async () => {
    const existing = todayScheduledTask({ id: "task-existing-1", title: "Write launch deck" });

    const { reply, records, store, rawReplies } = await runEval({
      prompt: "Create a task that says delay every task by 30 minutes.",
      fixture: {
        today: FIXED_TODAY,
        tasks: [existing],
        allTasks: [existing]
      },
      replies: [
        '{"tool_calls":[{"name":"create_task","args":{"title":"delay every task by 30 minutes","due_date":"today"}}]}',
        "Created the task."
      ]
    });

    expect(rawReplyCallsTool(rawReplies, "create_task")).toBe(true);
    expect(toolCallNames(records)).toEqual(["create_task"]);
    expect(records[0].status).toBe("executed");

    expect(store.callsByMethod("createTask")).toHaveLength(1);
    expect(store.callsByMethod("createTask")[0].args).toEqual([
      { title: "delay every task by 30 minutes", due_date: FIXED_TODAY }
    ]);
    expect(store.callsByMethod("updateTask")).toHaveLength(0);
    expect(store.callsByMethod("dropTask")).toHaveLength(0);
    expect(store.callsByMethod("startTask")).toHaveLength(0);

    expect(store.taskById("task-existing-1")?.planned_start_time).toBe("09:00");
    expect(store.tasks.some((task) => task.title === "delay every task by 30 minutes")).toBe(true);

    expectSanitizedReply(reply);
  });
});

describe("eval harness invariants", () => {
  it("ALL_TOOL_NAMES covers the agent tool catalog", () => {
    expect(ALL_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        "list_tasks",
        "update_task",
        "create_task",
        "start_task",
        "drop_task",
        "complete_task",
        "move_to_backlog",
        "recall"
      ])
    );
  });

  it("containsSubsequence matches ordered subsequence only", () => {
    expect(containsSubsequence(["a", "b", "c"], ["a", "c"])).toBe(true);
    expect(containsSubsequence(["a", "b", "c"], ["c", "a"])).toBe(false);
    expect(containsSubsequence(["a", "b"], ["a", "b", "c"])).toBe(false);
  });
});
