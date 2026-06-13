import { RefreshCw, Sparkles } from "lucide-react";
import type { DailyDebrief } from "../../types";
import { Button } from "../ui/Button";
import { DebriefContent } from "./DebriefContent";

type DayStoryProps = {
  debrief: DailyDebrief | null;
  keyConfigured: boolean;
  hasActivity: boolean;
  /** True when the day's data has moved on since this debrief was written. */
  dataChanged: boolean;
  generating: boolean;
  isToday: boolean;
  onGenerate: () => void;
};

/**
 * AI "story of your day" — a short, candid narrative plus one change for
 * tomorrow. The data charts stand on their own, so this degrades gracefully
 * when no provider is configured or there is nothing to reflect on.
 */
export function DayStory({
  debrief,
  keyConfigured,
  hasActivity,
  dataChanged,
  generating,
  isToday,
  onGenerate
}: DayStoryProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary-soft/40 p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary/80">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Story of your day
        </h2>
        {debrief && dataChanged ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={generating}
            onClick={onGenerate}
            title="New activity logged since this debrief — update it"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Update
          </Button>
        ) : null}
      </div>

      {debrief ? (
        <DebriefContent content={debrief.content} />
      ) : !keyConfigured ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Connect an AI provider in Settings → AI to get a warm, honest read on
          where your time went and one thing to change tomorrow.
        </p>
      ) : !hasActivity ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isToday
            ? "Once you log some focus time, generate a story to see where the day actually went."
            : "No focus was logged on this day, so there's nothing to reflect on."}
        </p>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Turn this day's sessions and stop-notes into a short, honest reflection.
          </p>
          <Button type="button" size="sm" variant="soft" loading={generating} onClick={onGenerate}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Generate story
          </Button>
        </div>
      )}
    </section>
  );
}
