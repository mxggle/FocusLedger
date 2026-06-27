import { describe, expect, it } from "vitest";
import { toRecallEntries } from "./recallHistory";
import type { TimeEntryWithTask } from "../../../types";

function entry(partial: Partial<TimeEntryWithTask>): TimeEntryWithTask {
  return {
    id: partial.id ?? "e1",
    task_id: partial.task_id ?? "t1",
    start_at: partial.start_at ?? "2026-06-12T09:00:00.000Z",
    end_at: partial.end_at ?? "2026-06-12T10:00:00.000Z",
    duration_seconds: partial.duration_seconds ?? 3600,
    note: partial.note ?? null,
    blocker: partial.blocker ?? null,
    next_action: partial.next_action ?? null,
    completion_rate: partial.completion_rate ?? null,
    created_at: "2026-06-12T10:00:00.000Z",
    updated_at: "2026-06-12T10:00:00.000Z",
    task_title: partial.task_title ?? "Write report",
    task_estimated_minutes: null,
    category_id: partial.category_id ?? null,
    category_name: partial.category_name ?? "Deep Work",
    category_color: null
  };
}

describe("toRecallEntries", () => {
  it("keeps only entries with at least one reflection field and maps the date", () => {
    const result = toRecallEntries([
      entry({ id: "a", note: "made progress" }),
      entry({ id: "b" }), // no reflection — dropped
      entry({ id: "c", blocker: "waiting on data" })
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      date: "2026-06-12",
      taskTitle: "Write report",
      category: "Deep Work",
      note: "made progress"
    });
    expect(result[1].blocker).toBe("waiting on data");
  });

  it("treats whitespace-only reflections as empty", () => {
    expect(toRecallEntries([entry({ note: "   ", blocker: "", next_action: null })])).toHaveLength(0);
  });
});
