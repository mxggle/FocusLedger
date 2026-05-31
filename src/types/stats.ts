export type CategoryStats = {
  categoryId: string;
  categoryName: string;
  color: string | null;
  totalSeconds: number;
};

export type TodayStats = {
  date: string;
  totalFocusSeconds: number;
  completedTaskCount: number;
  droppedTaskCount: number;
  estimatedSeconds: number;
  actualSeconds: number;
  driftSeconds: number;
  categoryStats: CategoryStats[];
};

export type DailyStats = TodayStats & {
  entriesCount: number;
};
