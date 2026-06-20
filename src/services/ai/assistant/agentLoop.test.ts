import { describe, expect, it, vi } from "vitest";
import { runAgentLoop, type RunAgentLoopInput } from "./agentLoop";
import type { AssistantStoreSnapshot } from "./contextBuilder";
import type { Category, Task } from "../../../types";

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-20",
  tasks: [],
  backlogTasks: [],
  categories: [],
  allTasks: []
};

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    id: partial.id,
    title: partial.title,
    description: partial.description ?? null,
    category_id: partial.category_id ?? null,
    status: partial.status ?? "todo",
    priority: partial.priority ?? "medium",
    estimated_minutes: partial.estimated_minutes ?? null,
    due_date: partial.due_date ?? null,
    template_id: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    completed_at: null,
    dropped_at: null
  };
}

function makeLoopInput(): RunAgentLoopInput {
  const category: Category = { id: "c1", name: "Work" } as Category;
  const allTasks = [
    task({ id: "t1", title: "First task", category_id: null }),
    task({ id: "t2", title: "Second task", category_id: null })
  ];
  return {
    settings: {} as never,
    snapshot: {
      selectedDate: "2026-06-20",
      tasks: [],
      backlogTasks: allTasks,
      categories: [category],
      allTasks,
      assistantName: "",
      assistantSoul: ""
    },
    messages: [{ role: "user", content: "categorize everything" }]
  };
}

describe("runAgentLoop", () => {
  it("executes a lookup, feeds results back, then finalizes", async () => {
    const generateChat = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ lookups: [{ tool: "search_tasks", query: "report" }] }))
      .mockResolvedValueOnce(JSON.stringify({ reply: "All set.", actions: [] }));
    const steps: string[] = [];

    const result = await runAgentLoop(
      {
        settings: {} as never,
        snapshot,
        messages: [{ role: "user", content: "plan my notes" }],
        onStep: (s) => steps.push(s)
      },
      { generateChat }
    );

    expect(generateChat).toHaveBeenCalledTimes(2);
    const secondMessages = generateChat.mock.calls[1][1].messages;
    expect(JSON.stringify(secondMessages)).toContain("search_tasks");
    expect(result.reply).toBe("All set.");
    expect(steps.length).toBeGreaterThan(0);
  });

  it("finalizes immediately when the first response is final", async () => {
    const generateChat = vi.fn().mockResolvedValue(JSON.stringify({ reply: "hi", actions: [] }));
    const result = await runAgentLoop(
      { settings: {} as never, snapshot, messages: [{ role: "user", content: "hi" }] },
      { generateChat }
    );
    expect(generateChat).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe("hi");
  });

  it("supports a bulk path: list_tasks lookup then multiple update_task actions", async () => {
    const responses = [
      JSON.stringify({ lookups: [{ tool: "list_tasks", category: "none" }] }),
      JSON.stringify({
        reply: "Categorized your two tasks.",
        actions: [
          { type: "update_task", task_id: "t1", category: "Work" },
          { type: "update_task", task_id: "t2", category: "Work" }
        ]
      })
    ];
    let i = 0;
    const result = await runAgentLoop(makeLoopInput(), {
      generateChat: async () => responses[i++]
    });
    expect(result.actions).toHaveLength(2);
    expect(result.actions.every((a) => a.type === "update_task")).toBe(true);
  });

  it("stops after the step budget and finalizes the last response", async () => {
    const generateChat = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ lookups: [{ tool: "search_tasks", query: "x" }] }));
    const result = await runAgentLoop(
      { settings: {} as never, snapshot, messages: [{ role: "user", content: "loop" }] },
      { generateChat }
    );
    expect(generateChat.mock.calls.length).toBeLessThanOrEqual(7);
    expect(result).toHaveProperty("reply");
  });
});
