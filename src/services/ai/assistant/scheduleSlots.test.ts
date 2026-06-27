import { describe, expect, it } from "vitest";
import { computeFreeSlots, minutesToHHMM } from "./scheduleSlots";

describe("minutesToHHMM", () => {
  it("formats and clamps", () => {
    expect(minutesToHHMM(0)).toBe("00:00");
    expect(minutesToHHMM(570)).toBe("09:30");
    expect(minutesToHHMM(24 * 60 + 99)).toBe("24:00");
  });
});

describe("computeFreeSlots", () => {
  const window = { start: 9 * 60, end: 18 * 60 }; // 09:00–18:00

  it("returns the whole window when nothing is busy", () => {
    expect(computeFreeSlots([], window.start, window.end, 30)).toEqual([
      { startMin: 540, endMin: 1080, minutes: 540 }
    ]);
  });

  it("returns the gaps around busy blocks", () => {
    const busy = [
      { start: 10 * 60, end: 11 * 60 }, // 10–11
      { start: 13 * 60, end: 14 * 60 } // 13–14
    ];
    const slots = computeFreeSlots(busy, window.start, window.end, 30);
    expect(slots).toEqual([
      { startMin: 540, endMin: 600, minutes: 60 }, // 09:00–10:00
      { startMin: 660, endMin: 780, minutes: 120 }, // 11:00–13:00
      { startMin: 840, endMin: 1080, minutes: 240 } // 14:00–18:00
    ]);
  });

  it("merges overlapping busy blocks so no phantom gap appears", () => {
    const busy = [
      { start: 10 * 60, end: 11 * 60 },
      { start: 10 * 60 + 30, end: 12 * 60 } // overlaps the first
    ];
    const slots = computeFreeSlots(busy, window.start, window.end, 30);
    expect(slots).toEqual([
      { startMin: 540, endMin: 600, minutes: 60 }, // 09:00–10:00
      { startMin: 720, endMin: 1080, minutes: 360 } // 12:00–18:00
    ]);
  });

  it("drops gaps shorter than the requested duration", () => {
    const busy = [{ start: 9 * 60 + 20, end: 17 * 60 }]; // leaves 09:00–09:20 and 17:00–18:00
    const slots = computeFreeSlots(busy, window.start, window.end, 30);
    expect(slots).toEqual([{ startMin: 1020, endMin: 1080, minutes: 60 }]); // only 17:00–18:00 qualifies
  });

  it("returns nothing for an inverted window", () => {
    expect(computeFreeSlots([], 18 * 60, 9 * 60, 30)).toEqual([]);
  });
});
