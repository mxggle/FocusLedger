import { describe, expect, it } from "vitest";
import {
  WEEKS_PER_YEAR,
  computeLifeProgress,
  describeWeek,
  parseLocalDate,
  weekIndexForDate,
  weekRange
} from "./lifeWeeks";

describe("parseLocalDate", () => {
  it("parses a valid date as local midnight", () => {
    const date = parseLocalDate("1995-06-15");
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(1995);
    expect(date?.getMonth()).toBe(5);
    expect(date?.getDate()).toBe(15);
  });

  it("rejects malformed and overflowing dates", () => {
    expect(parseLocalDate("")).toBeNull();
    expect(parseLocalDate("1995-6-1")).toBeNull();
    expect(parseLocalDate("2023-02-30")).toBeNull();
    expect(parseLocalDate("not-a-date")).toBeNull();
  });
});

describe("computeLifeProgress", () => {
  const now = new Date(2025, 5, 15); // 2025-06-15

  it("computes weeks lived and remaining for a 30th birthday", () => {
    const progress = computeLifeProgress("1995-06-15", 80, now);
    expect(progress).not.toBeNull();
    expect(progress?.totalWeeks).toBe(80 * WEEKS_PER_YEAR);
    expect(progress?.ageYears).toBe(30);
    // 30 years ≈ 1565 calendar weeks; current week sits at the lived boundary.
    expect(progress?.currentWeekIndex).toBe(progress?.weeksLived);
    expect(progress!.weeksLived + progress!.weeksRemaining).toBe(
      progress!.totalWeeks
    );
    expect(progress?.yearsRemaining).toBe(50);
  });

  it("clamps a future birth date to zero weeks lived", () => {
    const progress = computeLifeProgress("2030-01-01", 80, now);
    expect(progress?.weeksLived).toBe(0);
    expect(progress?.percentLived).toBe(0);
    expect(progress?.currentWeekIndex).toBe(0);
  });

  it("caps weeks lived at the life-expectancy horizon", () => {
    const progress = computeLifeProgress("1900-01-01", 80, now);
    expect(progress?.weeksLived).toBe(progress?.totalWeeks);
    expect(progress?.weeksRemaining).toBe(0);
    expect(progress?.currentWeekIndex).toBe(-1);
  });

  it("returns null for invalid input", () => {
    expect(computeLifeProgress("", 80, now)).toBeNull();
    expect(computeLifeProgress("1995-06-15", 0, now)).toBeNull();
    expect(computeLifeProgress("1995-06-15", Number.NaN, now)).toBeNull();
  });
});

describe("describeWeek", () => {
  it("maps a week index to a date and age row", () => {
    const week = describeWeek("1995-06-15", WEEKS_PER_YEAR * 2);
    expect(week?.age).toBe(2);
    expect(week?.date.getFullYear()).toBe(1997);
  });

  it("returns null for negative index or bad date", () => {
    expect(describeWeek("1995-06-15", -1)).toBeNull();
    expect(describeWeek("bad", 10)).toBeNull();
  });
});

describe("weekRange + weekIndexForDate round trip", () => {
  it("maps a date inside a week back to that week's index", () => {
    const range = weekRange("1995-06-15", 100);
    expect(range).not.toBeNull();
    const midweek = new Date(range!.start.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(weekIndexForDate("1995-06-15", midweek)).toBe(100);
    expect(range!.end.getTime() - range!.start.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000
    );
  });

  it("rejects pre-birth dates and bad input", () => {
    expect(weekIndexForDate("1995-06-15", new Date("1990-01-01"))).toBeNull();
    expect(weekIndexForDate("bad", new Date("2020-01-01"))).toBeNull();
    expect(weekRange("1995-06-15", -1)).toBeNull();
  });
});
