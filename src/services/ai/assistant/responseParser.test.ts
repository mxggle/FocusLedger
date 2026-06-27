import { describe, expect, it } from "vitest";
import { parseToolCalls } from "./responseParser";

describe("parseToolCalls", () => {
  it("parses a tool_calls object", () => {
    const raw =
      '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}},{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}';
    expect(parseToolCalls(raw)).toEqual([
      { name: "list_tasks", args: { scope: "today" } },
      { name: "update_task", args: { task_id: "t1", planned_start_time: "09:30" } }
    ]);
  });

  it("tolerates code fences or prose around tool JSON", () => {
    const raw = "thinking...\n```json\n{\"tool_calls\":[{\"name\":\"search_tasks\",\"args\":{\"query\":\"report\"}}]}\n```";
    expect(parseToolCalls(raw)).toEqual([{ name: "search_tasks", args: { query: "report" } }]);
  });

  it("returns null for a non-tool-call final markdown reply", () => {
    expect(parseToolCalls("Here is your plan.")).toBeNull();
    expect(parseToolCalls('{"reply":"x"}')).toBeNull();
  });

  it("drops malformed entries and returns null when no valid calls remain", () => {
    expect(parseToolCalls('{"tool_calls":[{"args":{}},{"name":"list_tasks"}]}')).toEqual([
      { name: "list_tasks", args: {} }
    ]);
    expect(parseToolCalls('{"tool_calls":[{"args":{}}]}')).toBeNull();
  });
});
