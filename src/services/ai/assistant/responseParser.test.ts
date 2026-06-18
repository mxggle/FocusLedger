import { describe, expect, it } from "vitest";
import { parseAssistantResponse } from "./responseParser";
import type { AssistantContext } from "./types";

const ctx: AssistantContext = {
  today: "2026-06-18",
  categories: [{ id: "c1", name: "Deep Work" }],
  tasks: [
    { id: "t1", title: "Write report", status: "todo", priority: "high", estimatedMinutes: 60, categoryId: "c1" }
  ],
  backlog: []
};

describe("parseAssistantResponse", () => {
  it("parses reply and valid actions", () => {
    const raw = JSON.stringify({
      reply: "Here's a plan.",
      actions: [{ type: "create_task", title: "Draft outline", due_date: "today" }]
    });
    const result = parseAssistantResponse(raw, ctx);
    expect(result.reply).toBe("Here's a plan.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].summary).toContain("Draft outline");
  });

  it("tolerates code fences around the JSON", () => {
    const raw = "```json\n{ \"reply\": \"hi\", \"actions\": [] }\n```";
    expect(parseAssistantResponse(raw, ctx).reply).toBe("hi");
  });

  it("drops invalid/unknown actions but keeps the reply", () => {
    const raw = JSON.stringify({
      reply: "ok",
      actions: [
        { type: "create_task", title: "Good" },
        { type: "explode_sun" },
        { type: "reschedule_task", task_id: "does-not-exist", due_date: "today" }
      ]
    });
    const result = parseAssistantResponse(raw, ctx);
    expect(result.actions).toHaveLength(1);
  });

  it("falls back to raw text as the reply when JSON is unparseable", () => {
    const result = parseAssistantResponse("Sorry, I cannot do that.", ctx);
    expect(result.reply).toBe("Sorry, I cannot do that.");
    expect(result.actions).toEqual([]);
  });

  it("defaults a missing actions field to an empty array", () => {
    const result = parseAssistantResponse(JSON.stringify({ reply: "hello" }), ctx);
    expect(result.actions).toEqual([]);
  });
});
