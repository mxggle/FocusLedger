import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../../types";
import { runToolLoop } from "./toolLoop";

function depsWith(updateTask = vi.fn(async () => ({ ok: true }))) {
  const tasks: Task[] = [
    {
      id: "t1",
      title: "Report",
      planned_start_time: "09:00",
      status: "todo",
      priority: "medium",
      description: null,
      category_id: null,
      estimated_minutes: null,
      due_date: "2026-06-23",
      template_id: null,
      planned_end_time: null,
      sort_order: null,
      created_at: "x",
      updated_at: "u0",
      completed_at: null,
      dropped_at: null
    }
  ];
  return {
    store: {
      getAllTasks: () => tasks,
      getCategories: () => [],
      updateTask,
      createTask: vi.fn(),
      deleteTask: vi.fn(),
      startTask: vi.fn(),
      pauseActiveTask: vi.fn(),
      completeTask: vi.fn(),
      dropTask: vi.fn(),
      moveTaskToBacklog: vi.fn(),
      ensureCategory: vi.fn(),
      refresh: vi.fn()
    },
    ctx: {
      today: "2026-06-23",
      categories: [],
      tasks: [],
      backlog: [],
      assistantName: "Yolo",
      assistantSoul: "",
      allTaskRefs: []
    },
    insights: null,
    history: [],
    now: () => "u1"
  } as never;
}

describe("runToolLoop", () => {
  it("auto mode composes list_tasks then update_task and executes the write in-loop", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const replies = [
      '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}}]}',
      '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}',
      "Pushed your morning back 30 minutes."
    ];
    let i = 0;
    const generateChat = vi.fn(async () => replies[i++]);
    const res = await runToolLoop(
      { system: "sys", messages: [{ role: "user", content: "delay everything 30 min" }], level: "auto", deps: depsWith(update) },
      { generateChat }
    );
    expect(update).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    expect(res.reply).toContain("Pushed your morning");
    const exec = res.toolCalls.find((call) => call.name === "update_task");
    expect(exec?.status).toBe("executed");
    expect(exec?.undo).toBeTruthy();
  });

  it("ask mode defers the write as pending and does not execute", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const replies = [
      '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}',
      "Proposed."
    ];
    let i = 0;
    const res = await runToolLoop(
      { system: "s", messages: [{ role: "user", content: "x" }], level: "ask", deps: depsWith(update) },
      { generateChat: vi.fn(async () => replies[i++]) }
    );
    expect(update).not.toHaveBeenCalled();
    expect(res.toolCalls.find((call) => call.name === "update_task")?.status).toBe("pending");
  });
});
