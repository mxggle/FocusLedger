import type { CategoryStats } from "../../types";

const FALLBACK_COLOR = "#71717a";

/**
 * SVG stroke-dasharray donut uses a circle whose circumference is normalized to
 * 100, so a segment's dash length equals its percentage directly.
 */
export const DONUT_CIRCUMFERENCE = 100;

export type DonutSegment = {
  categoryId: string;
  categoryName: string;
  color: string;
  seconds: number;
  pct: number;
  /** `"<len> <gap>"` for stroke-dasharray on a circumference-100 circle. */
  dashArray: string;
  /** Negative cumulative offset that rotates this segment into place. */
  dashOffset: number;
};

export type DonutModel = {
  segments: DonutSegment[];
  totalSeconds: number;
};

function round(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  // Normalize -0 (from rounding a 0 offset) to 0 for stable output.
  return rounded === 0 ? 0 : rounded;
}

/**
 * Turns per-category totals into donut segments. Segments are emitted in the
 * order given (already sorted largest-first by the stats service) and their
 * percentages sum to 100 when there is any time.
 */
export function buildDonutModel(categoryStats: CategoryStats[]): DonutModel {
  const totalSeconds = categoryStats.reduce((sum, stat) => sum + stat.totalSeconds, 0);
  if (totalSeconds <= 0) {
    return { segments: [], totalSeconds: 0 };
  }

  let cumulativePct = 0;
  const segments = categoryStats
    .filter((stat) => stat.totalSeconds > 0)
    .map((stat) => {
      const pct = round((stat.totalSeconds / totalSeconds) * 100);
      const segment: DonutSegment = {
        categoryId: stat.categoryId,
        categoryName: stat.categoryName,
        color: stat.color ?? FALLBACK_COLOR,
        seconds: stat.totalSeconds,
        pct,
        dashArray: `${pct} ${round(DONUT_CIRCUMFERENCE - pct)}`,
        dashOffset: round(-cumulativePct)
      };
      cumulativePct += pct;
      return segment;
    });

  return { segments, totalSeconds };
}
