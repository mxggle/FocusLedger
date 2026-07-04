import { describe, expect, it } from "vitest";
import type { ToolCallRecord } from "./agentTools/types";
import { renderToolTrace, stripToolTraceBlocks } from "./toolTrace";

function record(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    id: "tc1",
    name: "update_task",
    args: { task_id: "t1", planned_start_time: "15:00" },
    category: "write",
    destructive: false,
    summary: 'Move "Report" to 15:00',
    status: "executed",
    ...overrides
  };
}

describe("renderToolTrace", () => {
  it("returns empty string for no calls", () => {
    expect(renderToolTrace([])).toBe("");
  });

  it("renders executed calls with task id and summary", () => {
    const trace = renderToolTrace([record()]);
    expect(trace).toContain("update_task [task t1]");
    expect(trace).toContain('Move "Report" to 15:00');
    expect(trace).toContain("executed");
  });

  it("marks pending calls as queued and not applied", () => {
    const trace = renderToolTrace([record({ status: "pending" })]);
    expect(trace).toContain("NOT applied");
  });

  it("includes the error for failed calls", () => {
    const trace = renderToolTrace([record({ status: "failed", error: "slot collision" })]);
    expect(trace).toContain("failed");
    expect(trace).toContain("slot collision");
  });

  it("omits the task tag when args carry no task_id", () => {
    const trace = renderToolTrace([record({ name: "create_task", args: { title: "New" } })]);
    expect(trace).toContain("- create_task:");
    expect(trace).not.toContain("[task");
  });
});

describe("stripToolTraceBlocks", () => {
  it("leaves text without a trace block untouched", () => {
    expect(stripToolTraceBlocks("All set — three tasks moved.")).toBe("All set — three tasks moved.");
  });

  it("removes a closed trace block and keeps the surrounding reply", () => {
    const text = `我已删除任务。\n\n[Tool activity in this turn — internal:\n- drop_task [task t1]: Dropped "A" — applied\n]\n\n还有什么需要吗？`;
    const cleaned = stripToolTraceBlocks(text);
    expect(cleaned).not.toContain("[Tool activity");
    expect(cleaned).not.toContain("t1");
    expect(cleaned).toContain("我已删除任务。");
    expect(cleaned).toContain("还有什么需要吗？");
  });

  it("removes an unclosed trace block running to the end of text", () => {
    const text = `Done.\n\n[Tool activity in this turn — internal:\n- drop_task [task t1]: Dropped`;
    expect(stripToolTraceBlocks(text)).toBe("Done.");
  });

  it("removes the app-generated trace verbatim", () => {
    const trace = renderToolTrace([record()]);
    expect(stripToolTraceBlocks(`ok\n\n${trace}`)).toBe("ok");
  });
});
