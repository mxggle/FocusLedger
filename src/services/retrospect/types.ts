// src/services/retrospect/types.ts

/** Whether an insight has enough samples to state confidently. */
export type Confidence = "ok" | "low";

/** Estimate-vs-actual for one scope (overall or a single category). */
export type CalibrationStat = {
  scope: string; // "overall" or a category name
  estimatedMinutes: number;
  actualMinutes: number;
  ratio: number; // actualMinutes / estimatedMinutes
  sampleSize: number; // number of qualifying tasks
  confidence: Confidence;
};

export type EstimationCalibration = {
  overall: CalibrationStat | null; // null when no qualifying data
  byCategory: CalibrationStat[];
};

export type SlipItem = {
  taskId: string;
  title: string;
  kind: "overdue" | "lingering" | "dropped";
  ageDays: number;
};

export type BlockerTheme = {
  keyword: string;
  count: number;
};

export type SlipAnalysis = {
  items: SlipItem[]; // top N by ageDays
  moreCount: number; // qualifying slips beyond the top N
  blockerThemes: BlockerTheme[];
};

export type CategoryDelta = {
  category: string;
  thisWeekMinutes: number;
  lastWeekMinutes: number;
  deltaMinutes: number; // thisWeek - lastWeek
};

export type WeeklyReview = {
  thisWeekMinutes: number;
  lastWeekMinutes: number;
  deltaMinutes: number;
  categoryDeltas: CategoryDelta[]; // top movers by abs(delta)
  completedCount: number; // tasks completed in the last 7 days
  droppedCount: number; // tasks dropped in the last 7 days
};

export type RetrospectiveInsights = {
  windowDays: number;
  hasData: boolean;
  calibration: EstimationCalibration;
  slips: SlipAnalysis;
  weekly: WeeklyReview;
};
