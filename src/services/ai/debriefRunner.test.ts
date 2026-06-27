import { describe, expect, it } from "vitest";
import { parseTimeOfDay, shouldRunAutoDebrief, type AutoDebriefCheck } from "./debriefRunner";

function check(overrides: Partial<AutoDebriefCheck> = {}): AutoDebriefCheck {
  return {
    enabled: true,
    time: "23:00",
    now: new Date("2026-06-13T23:05:00"),
    hasKey: true,
    hasEntries: true,
    alreadyGenerated: false,
    alreadyAttempted: false,
    ...overrides
  };
}

describe("parseTimeOfDay", () => {
  it("builds today's date at the given time", () => {
    const reference = new Date("2026-06-13T08:00:00");
    const result = parseTimeOfDay("23:00", reference);
    expect(result?.getHours()).toBe(23);
    expect(result?.getMinutes()).toBe(0);
    expect(result?.getDate()).toBe(reference.getDate());
  });

  it("rejects malformed or out-of-range values", () => {
    const reference = new Date();
    expect(parseTimeOfDay("", reference)).toBeNull();
    expect(parseTimeOfDay("25:00", reference)).toBeNull();
    expect(parseTimeOfDay("12:60", reference)).toBeNull();
    expect(parseTimeOfDay("noon", reference)).toBeNull();
  });
});

describe("shouldRunAutoDebrief", () => {
  it("fires at or after the scheduled time", () => {
    expect(shouldRunAutoDebrief(check({ now: new Date("2026-06-13T23:00:00") }))).toBe(true);
    expect(shouldRunAutoDebrief(check({ now: new Date("2026-06-13T23:42:00") }))).toBe(true);
  });

  it("does not fire before the scheduled time", () => {
    expect(shouldRunAutoDebrief(check({ now: new Date("2026-06-13T22:59:00") }))).toBe(false);
  });

  it("requires the feature, a key, and logged activity", () => {
    expect(shouldRunAutoDebrief(check({ enabled: false }))).toBe(false);
    expect(shouldRunAutoDebrief(check({ hasKey: false }))).toBe(false);
    expect(shouldRunAutoDebrief(check({ hasEntries: false }))).toBe(false);
  });

  it("fires at most once per day", () => {
    expect(shouldRunAutoDebrief(check({ alreadyGenerated: true }))).toBe(false);
    expect(shouldRunAutoDebrief(check({ alreadyAttempted: true }))).toBe(false);
  });

  it("treats a malformed time as disabled", () => {
    expect(shouldRunAutoDebrief(check({ time: "oops" }))).toBe(false);
  });

  it("AI-DEBRIEF-02: fires once per day after the configured time only when enabled, key, and entries exist", () => {
    expect(
      shouldRunAutoDebrief(
        check({ now: new Date("2026-06-13T23:30:00"), enabled: true, hasKey: true, hasEntries: true })
      )
    ).toBe(true);
    expect(shouldRunAutoDebrief(check({ now: new Date("2026-06-13T22:59:00") }))).toBe(false);
    expect(shouldRunAutoDebrief(check({ enabled: false }))).toBe(false);
    expect(shouldRunAutoDebrief(check({ hasKey: false }))).toBe(false);
    expect(shouldRunAutoDebrief(check({ hasEntries: false }))).toBe(false);
    expect(shouldRunAutoDebrief(check({ alreadyGenerated: true }))).toBe(false);
    expect(shouldRunAutoDebrief(check({ alreadyAttempted: true }))).toBe(false);
  });
});
