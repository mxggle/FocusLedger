import { describe, expect, it } from "vitest";
import { computeDayBriefing } from "./dayBriefing";
import type { ContextTask } from "./types";

function ctxTask(partial: Partial<ContextTask> & { id: string }): ContextTask {
  return {
    id: partial.id,
    title: partial.title ?? "Task",
    status: partial.status ?? "todo",
    priority: partial.priority ?? "medium",
    estimatedMinutes: partial.estimatedMinutes ?? null,
    categoryId: partial.categoryId ?? null
  };
}

describe("computeDayBriefing", () => {
  it("sums estimates for open tasks only and counts done separately", () => {
    const tasks = [
      ctxTask({ id: "a", status: "todo", estimatedMinutes: 60 }),
      ctxTask({ id: "b", status: "doing", estimatedMinutes: 30 }),
      ctxTask({ id: "c", status: "done", estimatedMinutes: 90 }),
      ctxTask({ id: "d", status: "paused", estimatedMinutes: null })
    ];
    const b = computeDayBriefing(tasks, 5, 240);
    expect(b.scheduledMinutes).toBe(90); // 60 + 30 (done + null excluded)
    expect(b.openCount).toBe(3); // todo, doing, paused
    expect(b.doneCount).toBe(1);
    expect(b.backlogCount).toBe(5);
    expect(b.targetMinutes).toBe(240);
  });

  it("flags overcommitted when scheduled exceeds the target", () => {
    const tasks = [ctxTask({ id: "a", estimatedMinutes: 300 })];
    const b = computeDayBriefing(tasks, 0, 240);
    expect(b.status).toBe("overcommitted");
    expect(b.overcommitMinutes).toBe(60);
  });

  it("flags a light day when well under half the target", () => {
    const tasks = [ctxTask({ id: "a", estimatedMinutes: 30 })];
    expect(computeDayBriefing(tasks, 0, 240).status).toBe("light");
  });

  it("is balanced between the light and overcommit thresholds", () => {
    const tasks = [ctxTask({ id: "a", estimatedMinutes: 180 })];
    const b = computeDayBriefing(tasks, 0, 240);
    expect(b.status).toBe("balanced");
    expect(b.overcommitMinutes).toBe(0);
  });

  it("is empty when there are no open tasks", () => {
    expect(computeDayBriefing([ctxTask({ id: "a", status: "done", estimatedMinutes: 60 })], 3, 240).status).toBe(
      "empty"
    );
    expect(computeDayBriefing([], 0, 240).status).toBe("empty");
  });

  it("does not flag overcommit or light when the target is 0", () => {
    const tasks = [ctxTask({ id: "a", estimatedMinutes: 600 })];
    const b = computeDayBriefing(tasks, 0, 0);
    expect(b.status).toBe("balanced");
    expect(b.overcommitMinutes).toBe(0);
  });
});
