import { describe, expect, it } from "vitest";
import { computeTimePulse, hhmmToMinutes, renderTimePulse } from "./timePulse";
import type { ContextTask } from "./types";

function t(p: Partial<ContextTask> & { id: string }): ContextTask {
  return {
    title: "Task",
    status: "todo",
    priority: "medium",
    estimatedMinutes: null,
    categoryId: null,
    plannedStartTime: null,
    plannedEndTime: null,
    ...p
  };
}

describe("hhmmToMinutes", () => {
  it("parses HH:mm and rejects junk", () => {
    expect(hhmmToMinutes("09:30")).toBe(570);
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("9:30")).toBeNull();
    expect(hhmmToMinutes("25:00")).toBeNull();
    expect(hhmmToMinutes(null)).toBeNull();
  });
});

describe("computeTimePulse", () => {
  const now = 10 * 60; // 10:00

  it("flags the task whose planned window contains now", () => {
    const pulse = computeTimePulse(now, [
      t({ id: "a", title: "Deep work", status: "doing", plannedStartTime: "09:30", plannedEndTime: "11:00" })
    ]);
    expect(pulse?.current).toEqual({ title: "Deep work", endsInMin: 60 });
  });

  it("finds the earliest upcoming task as next", () => {
    const pulse = computeTimePulse(now, [
      t({ id: "a", title: "Late", plannedStartTime: "15:00", plannedEndTime: "16:00" }),
      t({ id: "b", title: "Soon", plannedStartTime: "10:30", plannedEndTime: "11:00" })
    ]);
    expect(pulse?.next).toEqual({ title: "Soon", startsInMin: 30 });
  });

  it("reports open tasks whose planned slot already elapsed as overdue", () => {
    const pulse = computeTimePulse(now, [
      t({ id: "a", title: "Missed", status: "todo", plannedStartTime: "08:00", plannedEndTime: "09:00" })
    ]);
    expect(pulse?.overdue).toEqual([{ title: "Missed", endedMinAgo: 60 }]);
  });

  it("ignores done tasks and returns null when nothing is time-relevant", () => {
    expect(
      computeTimePulse(now, [t({ id: "a", title: "Finished", status: "done", plannedStartTime: "08:00", plannedEndTime: "09:00" })])
    ).toBeNull();
    expect(computeTimePulse(now, [t({ id: "b", title: "Unscheduled" })])).toBeNull();
  });

  it("renders a one-line narration of the parts that exist", () => {
    const pulse = computeTimePulse(now, [
      t({ id: "a", title: "Deep work", status: "doing", plannedStartTime: "09:30", plannedEndTime: "11:00" }),
      t({ id: "b", title: "Standup", plannedStartTime: "10:30", plannedEndTime: "10:45" })
    ])!;
    const line = renderTimePulse(pulse);
    expect(line).toContain("Deep work");
    expect(line).toContain("Standup");
    expect(line).toMatch(/do not recalculate/i);
  });
});
