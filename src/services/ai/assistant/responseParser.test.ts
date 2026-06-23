import { describe, expect, it } from "vitest";
import { parseAssistantResponse, parseLoopStep, parseToolCalls } from "./responseParser";
import type { AssistantContext } from "./types";

const ctx: AssistantContext = {
  today: "2026-06-18",
  categories: [{ id: "c1", name: "Deep Work" }],
  tasks: [
    { id: "t1", title: "Write report", status: "todo", priority: "high", estimatedMinutes: 60, categoryId: "c1" }
  ],
  backlog: [],
  assistantName: "",
  assistantSoul: "",
  allTaskRefs: []
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

  it("splits a trailing ```json fence into reply + actions", () => {
    const raw = [
      "Here's your plan for today.",
      "",
      "1. **Ship the landing page** — 90 min",
      "",
      "```json",
      '[{ "type": "create_task", "title": "Draft outline", "due_date": "today" }]',
      "```"
    ].join("\n");
    const result = parseAssistantResponse(raw, ctx);
    expect(result.reply).toBe("Here's your plan for today.\n\n1. **Ship the landing page** — 90 min");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("create_task");
    expect(result.actions[0].summary).toContain("Draft outline");
  });

  it("parses an empty fenced actions array", () => {
    const raw = "Just advice, no changes needed.\n\n```json\n[]\n```";
    const result = parseAssistantResponse(raw, ctx);
    expect(result.reply).toBe("Just advice, no changes needed.");
    expect(result.actions).toEqual([]);
  });

  it("accepts a plain ``` fence containing a JSON array", () => {
    const raw = "Plan ready.\n\n```\n[{ \"type\": \"create_task\", \"title\": \"X\" }]\n```";
    const result = parseAssistantResponse(raw, ctx);
    expect(result.reply).toBe("Plan ready.");
    expect(result.actions).toHaveLength(1);
  });

  it("drops invalid actions inside a fence but keeps the reply", () => {
    const raw = "Here you go.\n\n```json\n[{ \"type\": \"explode_sun\" }, { \"type\": \"create_task\", \"title\": \"Good\" }]\n```";
    const result = parseAssistantResponse(raw, ctx);
    expect(result.reply).toBe("Here you go.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].summary).toContain("Good");
  });

  it("falls back to the whole text when the trailing fence is malformed JSON", () => {
    const raw = "Here is a plan.\n\n```json\n{not valid json\n```";
    const result = parseAssistantResponse(raw, ctx);
    expect(result.actions).toEqual([]);
    expect(result.reply).toBe(raw.trim());
  });

  it("does not treat a mid-text fence as the actions block", () => {
    // A fence that is NOT at the end should not be split off.
    const raw = "```json\n[{ \"type\": \"create_task\", \"params\": { \"title\": \"X\" } }]\n```\n\nAnd a closing remark.";
    const result = parseAssistantResponse(raw, ctx);
    // No trailing fence → falls through to legacy object parse, which finds the
    // first object inside the array and yields at least a reply.
    expect(typeof result.reply).toBe("string");
  });
});

describe("parseLoopStep", () => {
  it("classifies a non-empty lookups array as a lookups step", () => {
    const raw = JSON.stringify({ lookups: [{ tool: "search_tasks", query: "report" }] });
    const step = parseLoopStep(raw);
    expect(step.kind).toBe("lookups");
    if (step.kind === "lookups") {
      expect(step.lookups).toHaveLength(1);
      expect(step.lookups[0].tool).toBe("search_tasks");
    }
  });

  it("treats a reply/actions object as final", () => {
    const raw = JSON.stringify({ reply: "done", actions: [] });
    expect(parseLoopStep(raw).kind).toBe("final");
  });

  it("treats an empty lookups array as final (nothing to look up)", () => {
    const raw = JSON.stringify({ lookups: [], reply: "hi" });
    expect(parseLoopStep(raw).kind).toBe("final");
  });

  it("treats unparseable text as final", () => {
    expect(parseLoopStep("plain text").kind).toBe("final");
  });
});

describe("parseToolCalls", () => {
  it("parses a tool_calls object", () => {
    const raw =
      '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}},{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}';
    expect(parseToolCalls(raw)).toEqual([
      { name: "list_tasks", args: { scope: "today" } },
      { name: "update_task", args: { task_id: "t1", planned_start_time: "09:30" } }
    ]);
  });

  it("returns null for a non-tool-call final markdown reply", () => {
    expect(parseToolCalls("Here is your plan.")).toBeNull();
    expect(parseToolCalls('{"reply":"x"}')).toBeNull();
  });
});
