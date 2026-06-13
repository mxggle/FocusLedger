export type DailyDebrief = {
  /** `YYYY-MM-DD` — one debrief per day, regenerating overwrites. */
  date: string;
  content: string;
  provider: string;
  model: string;
  /** Fingerprint of the inputs that produced this debrief; null for pre-migration rows. */
  input_hash: string | null;
  created_at: string;
  updated_at: string;
};
