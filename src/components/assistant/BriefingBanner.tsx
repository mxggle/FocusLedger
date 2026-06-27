import { CalendarClock } from "lucide-react";
import { hasAiKey } from "../../services/ai/aiClient";
import { summarizeBriefing, type BriefingTone } from "../../services/ai/assistant/briefingSummary";
import { useAssistantStore } from "../../stores/assistantStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useDayBriefing } from "./useDayBriefing";

const TONE_STYLES: Record<BriefingTone, string> = {
  info: "border-border bg-surface text-foreground",
  warn: "border-warning/40 bg-warning-soft text-warning-soft-foreground",
  good: "border-border bg-surface text-muted-foreground"
};

/** A compact, deterministic "today at a glance" bar with one contextual action.
 *  Rendering needs no API call; the CTA only sends a prompt when a key is set. */
export function BriefingBanner() {
  const briefing = useDayBriefing();
  const send = useAssistantStore((state) => state.send);
  const thinking = useAssistantStore((state) => state.status === "thinking");
  const settings = useSettingsStore((state) => state.settings);
  const keyConfigured = hasAiKey(settings);

  const summary = summarizeBriefing(briefing);

  return (
    <div className={`flex items-center gap-2 border-b px-4 py-2 text-xs ${TONE_STYLES[summary.tone]}`}>
      <CalendarClock className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="flex-1 leading-snug">{summary.headline}</span>
      {summary.cta && keyConfigured ? (
        <button
          type="button"
          onClick={() => void send(summary.cta!.prompt)}
          disabled={thinking}
          className="shrink-0 rounded-md border border-primary/40 px-2 py-0.5 font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {summary.cta.label}
        </button>
      ) : null}
    </div>
  );
}
