import { describe, expect, it } from "vitest";
import { findFreeSlotsTool } from "./findFreeSlots";
import type { ContextTask } from "../types";
import type { AgentToolDeps } from "./types";

function ct(p: Partial<ContextTask> & { id: string }): ContextTask {
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

function deps(tasks: ContextTask[], currentTime?: string): AgentToolDeps {
  return {
    store: {} as never,
    ctx: { today: "2026-06-23", tasks, currentTime } as never,
    insights: null,
    history: [],
    now: () => "t1"
  };
}

describe("find_free_slots tool", () => {
  it("returns the gaps around today's planned tasks", async () => {
    const tasks = [
      ct({ id: "a", plannedStartTime: "10:00", plannedEndTime: "11:00" }),
      ct({ id: "b", plannedStartTime: "13:00", plannedEndTime: "14:00" })
    ];
    const res = await findFreeSlotsTool.execute({ duration_minutes: 30 }, deps(tasks));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const slots = (res.data as { slots: { start: string; end: string }[] }).slots;
      expect(slots).toContainEqual({ start: "09:00", end: "10:00", minutes: 60 });
      expect(slots).toContainEqual({ start: "11:00", end: "13:00", minutes: 120 });
    }
  });

  it("never offers a slot in the past on the real today", async () => {
    // It's 14:30 now; the 09:00–10:00 gap must not be offered.
    const res = await findFreeSlotsTool.execute({}, deps([], "2026-06-23T14:30:00"));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const slots = (res.data as { slots: { start: string }[] }).slots;
      expect(slots.every((slot) => slot.start >= "14:30")).toBe(true);
    }
  });

  it("ignores dropped tasks when computing busy time", async () => {
    const res = await findFreeSlotsTool.execute(
      { earliest: "09:00", latest: "10:00", duration_minutes: 30 },
      deps([ct({ id: "a", status: "dropped", plannedStartTime: "09:00", plannedEndTime: "10:00" })])
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.data as { slots: unknown[] }).slots).toHaveLength(1);
    }
  });

  it("reports when nothing fits", async () => {
    const res = await findFreeSlotsTool.execute(
      { earliest: "09:00", latest: "10:00", duration_minutes: 90 },
      deps([])
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.summary).toMatch(/No open/);
  });
});
