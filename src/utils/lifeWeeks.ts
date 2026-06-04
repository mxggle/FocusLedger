/**
 * "Your life in weeks" math — the engine behind the Life page.
 *
 * Each square in the grid is one week of your life. We model a lifetime as a
 * simple WEEKS_PER_YEAR × lifeExpectancyYears rectangle (Tim Urban / "Four
 * Thousand Weeks" style) and place "now" inside it.
 */

export const WEEKS_PER_YEAR = 52;
export const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export const MIN_LIFE_EXPECTANCY = 1;
export const MAX_LIFE_EXPECTANCY = 130;

export type LifeProgress = {
  /** Total squares in the grid (lifeExpectancyYears × 52). */
  totalWeeks: number;
  /** Whole weeks already lived, clamped to [0, totalWeeks]. */
  weeksLived: number;
  /** Squares still ahead of you. */
  weeksRemaining: number;
  /** Index of the week you are living right now, or -1 if outside the grid. */
  currentWeekIndex: number;
  /** Share of the grid already filled, 0–100. */
  percentLived: number;
  /** Calendar age in whole years. */
  ageYears: number;
  /** Whole years left until the life-expectancy horizon (never negative). */
  yearsRemaining: number;
};

/**
 * Parse a `YYYY-MM-DD` string as a *local* date (no timezone surprises).
 * Returns null for anything that is not a real calendar date.
 */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  // Reject overflow (e.g. 2023-02-30 → Mar 2) by round-tripping the parts.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function calendarAge(birth: Date, now: Date): number {
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

export function computeLifeProgress(
  birthDateISO: string,
  lifeExpectancyYears: number,
  now: Date = new Date()
): LifeProgress | null {
  const birth = parseLocalDate(birthDateISO);
  if (
    !birth ||
    !Number.isFinite(lifeExpectancyYears) ||
    lifeExpectancyYears < MIN_LIFE_EXPECTANCY
  ) {
    return null;
  }

  const totalWeeks = Math.round(lifeExpectancyYears) * WEEKS_PER_YEAR;
  const rawWeeksLived = Math.floor((now.getTime() - birth.getTime()) / MS_PER_WEEK);
  const weeksLived = Math.max(0, Math.min(rawWeeksLived, totalWeeks));
  const weeksRemaining = totalWeeks - weeksLived;
  const currentWeekIndex = weeksLived < totalWeeks ? weeksLived : -1;
  const percentLived = totalWeeks > 0 ? (weeksLived / totalWeeks) * 100 : 0;
  const ageYears = calendarAge(birth, now);
  const yearsRemaining = Math.max(0, Math.round(lifeExpectancyYears) - ageYears);

  return {
    totalWeeks,
    weeksLived,
    weeksRemaining,
    currentWeekIndex,
    percentLived,
    ageYears,
    yearsRemaining
  };
}

/**
 * Describe a single square: the calendar date that week begins and the age
 * (whole years, matching the grid's row) you were during it.
 */
export function describeWeek(
  birthDateISO: string,
  weekIndex: number
): { date: Date; age: number } | null {
  const birth = parseLocalDate(birthDateISO);
  if (!birth || weekIndex < 0) return null;
  return {
    date: new Date(birth.getTime() + weekIndex * MS_PER_WEEK),
    age: Math.floor(weekIndex / WEEKS_PER_YEAR)
  };
}

/**
 * The real 7-day calendar span a square covers: `[start, end)`.
 * This is what makes squares actionable — each one maps to concrete days you
 * can inspect or plan against.
 */
export function weekRange(
  birthDateISO: string,
  weekIndex: number
): { start: Date; end: Date } | null {
  const birth = parseLocalDate(birthDateISO);
  if (!birth || weekIndex < 0) return null;
  const start = new Date(birth.getTime() + weekIndex * MS_PER_WEEK);
  return { start, end: new Date(start.getTime() + MS_PER_WEEK) };
}

/**
 * Which life-week a given moment falls into. Used to bucket real time entries
 * onto the grid. Returns null for dates before birth or invalid input.
 */
export function weekIndexForDate(birthDateISO: string, date: Date): number | null {
  const birth = parseLocalDate(birthDateISO);
  if (!birth || Number.isNaN(date.getTime())) return null;
  const index = Math.floor((date.getTime() - birth.getTime()) / MS_PER_WEEK);
  return index >= 0 ? index : null;
}
