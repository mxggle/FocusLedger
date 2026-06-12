export type DailyDebrief = {
  /** `YYYY-MM-DD` — one debrief per day, regenerating overwrites. */
  date: string;
  content: string;
  provider: string;
  model: string;
  created_at: string;
  updated_at: string;
};
