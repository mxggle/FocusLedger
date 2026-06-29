import { describe, expect, it } from "vitest";
import { decideAfterTaskRest } from "./restDecision";

const base = {
  restEnabled: true,
  restAfterTask: "ask" as const,
  restAfterTaskMinSessionMinutes: 15
};

describe("decideAfterTaskRest", () => {
  it("does nothing while already resting", () => {
    expect(decideAfterTaskRest({ ...base, restAfterTask: "auto" }, 3600, true)).toBe("none");
  });

  it("does nothing when rest is disabled", () => {
    expect(decideAfterTaskRest({ ...base, restEnabled: false }, 3600, false)).toBe("none");
  });

  it("does nothing when after-task is off", () => {
    expect(decideAfterTaskRest({ ...base, restAfterTask: "off" }, 3600, false)).toBe("none");
  });

  it("skips sessions shorter than the minimum", () => {
    // 14 minutes < 15 minute threshold
    expect(decideAfterTaskRest(base, 14 * 60, false)).toBe("none");
  });

  it("offers a break for a long enough session in ask mode", () => {
    expect(decideAfterTaskRest(base, 20 * 60, false)).toBe("ask");
  });

  it("includes the exact threshold", () => {
    expect(decideAfterTaskRest(base, 15 * 60, false)).toBe("ask");
  });

  it("starts rest directly in auto mode", () => {
    expect(decideAfterTaskRest({ ...base, restAfterTask: "auto" }, 30 * 60, false)).toBe("auto");
  });

  it("treats a zero threshold as always-offer", () => {
    expect(
      decideAfterTaskRest({ ...base, restAfterTaskMinSessionMinutes: 0 }, 5, false)
    ).toBe("ask");
  });
});
