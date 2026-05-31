import { describe, expect, it } from "vitest";
import { formatDurationCompact, formatTimer } from "./duration";

describe("duration formatting", () => {
  it("formats timer values as HH:MM:SS", () => {
    expect(formatTimer(0)).toBe("00:00:00");
    expect(formatTimer(3723)).toBe("01:02:03");
  });

  it("formats compact durations for summaries", () => {
    expect(formatDurationCompact(0)).toBe("0m");
    expect(formatDurationCompact(59)).toBe("1m");
    expect(formatDurationCompact(3600 + 20 * 60)).toBe("1h 20m");
  });
});
