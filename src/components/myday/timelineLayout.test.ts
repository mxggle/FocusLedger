import { describe, expect, it } from "vitest";
import type { TimeEntryWithTask } from "../../types";
import { buildTimelineModel, formatHourMark } from "./timelineLayout";

const DATE = "2026-06-13";

function entry(overrides: Partial<TimeEntryWithTask> = {}): TimeEntryWithTask {
  return {
    id: "e1",
    task_id: "t1",
    start_at: "2026-06-13T09:00:00",
    end_at: "2026-06-13T10:00:00",
    duration_seconds: 3600,
    note: null,
    blocker: null,
    next_action: null,
    completion_rate: null,
    created_at: "2026-06-13T09:00:00",
    updated_at: "2026-06-13T10:00:00",
    task_title: "Write spec",
    task_estimated_minutes: null,
    category_id: "c1",
    category_name: "Deep Work",
    category_color: "#6366f1",
    ...overrides
  };
}

describe("buildTimelineModel", () => {
  it("returns an empty default-window model when there are no sessions", () => {
    const model = buildTimelineModel([], DATE);
    expect(model.empty).toBe(true);
    expect(model.blocks).toHaveLength(0);
    expect(model.startHour).toBe(9);
    expect(model.endHour).toBe(18);
  });

  it("snaps the window to the hours containing a single session", () => {
    const model = buildTimelineModel([entry()], DATE);
    expect(model.empty).toBe(false);
    expect(model.startHour).toBe(9);
    expect(model.endHour).toBe(10);
    expect(model.blocks[0].leftPct).toBeCloseTo(0, 5);
    expect(model.blocks[0].widthPct).toBeCloseTo(100, 5);
    expect(model.blocks[0].startLabel).toBe("09:00");
    expect(model.blocks[0].endLabel).toBe("10:00");
  });

  it("positions multiple sessions proportionally within the window", () => {
    const model = buildTimelineModel(
      [
        entry({ id: "a", start_at: "2026-06-13T09:00:00", end_at: "2026-06-13T09:30:00" }),
        entry({ id: "b", start_at: "2026-06-13T11:00:00", end_at: "2026-06-13T12:00:00" })
      ],
      DATE
    );
    // Window is 09:00 → 12:00 = 3h.
    expect(model.startHour).toBe(9);
    expect(model.endHour).toBe(12);
    const [a, b] = model.blocks;
    expect(a.leftPct).toBeCloseTo(0, 4);
    expect(a.widthPct).toBeCloseTo((0.5 / 3) * 100, 4);
    expect(b.leftPct).toBeCloseTo((2 / 3) * 100, 4);
    expect(b.widthPct).toBeCloseTo((1 / 3) * 100, 4);
  });

  it("ends a running session at now and flags it", () => {
    const now = new Date("2026-06-13T09:30:00");
    const model = buildTimelineModel([entry({ end_at: null, duration_seconds: null })], DATE, now);
    const block = model.blocks[0];
    expect(block.running).toBe(true);
    expect(block.endLabel).toBe("now");
    expect(block.durationSeconds).toBe(1800);
  });

  it("clamps a session that started the previous day to the day's start", () => {
    const model = buildTimelineModel(
      [entry({ start_at: "2026-06-12T23:00:00", end_at: "2026-06-13T01:00:00" })],
      DATE
    );
    expect(model.startHour).toBe(0);
    expect(model.blocks[0].leftPct).toBeCloseTo(0, 4);
    expect(model.blocks[0].startLabel).toBe("00:00");
  });
});

describe("formatHourMark", () => {
  it("renders compact 12-hour labels", () => {
    expect(formatHourMark(9)).toBe("9a");
    expect(formatHourMark(12)).toBe("12p");
    expect(formatHourMark(18)).toBe("6p");
    expect(formatHourMark(0)).toBe("12a");
    expect(formatHourMark(24)).toBe("12a");
  });
});
