/**
 * A rest / break session. Deliberately *not* a task or a time entry: rest is the
 * absence of work, so it never carries a `task_id` and never flows into
 * calibration, slip analysis, category stats, or the daily focus total. It is
 * persisted only so the day timeline can show — honestly — that you stepped
 * away, rendered as a calm marker rather than a task card.
 *
 * @see src/db/restSessionRepository.ts
 */
export type RestSession = {
  id: string;
  start_at: string;
  end_at: string | null;
  duration_seconds: number | null;
  /** How the rest began: explicit button vs. offered after a finished focus. */
  trigger: RestTrigger;
  created_at: string;
  updated_at: string;
};

export type RestTrigger = "manual" | "auto";
