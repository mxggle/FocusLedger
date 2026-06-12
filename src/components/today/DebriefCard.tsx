import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { debriefRepository } from "../../db/debriefRepository";
import { generateDebrief } from "../../services/ai/debriefService";
import { hasAiKey } from "../../services/ai/aiClient";
import { resolveModel } from "../../services/ai/providers";
import { calculateTodayStats } from "../../services/statsService";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { useUiStore } from "../../stores/uiStore";
import type { DailyDebrief } from "../../types";
import { toDateKey } from "../../utils/date";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

/**
 * End-of-day AI debrief: turns today's tasks, sessions, and stop-notes into a
 * short reflection. Saved per day so History accumulates a reviewable journal.
 */
export function DebriefCard() {
  const settings = useSettingsStore((state) => state.settings);
  const allTasks = useTaskStore((state) => state.allTasks);
  const todayEntries = useTaskStore((state) => state.todayEntries);
  const categories = useTaskStore((state) => state.categories);
  const initialized = useTaskStore((state) => state.initialized);
  const now = useTimerStore((state) => state.now);
  const addToast = useUiStore((state) => state.addToast);

  const today = toDateKey(now);
  const [debrief, setDebrief] = useState<DailyDebrief | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    debriefRepository
      .getForDate(today)
      .then((saved) => {
        if (!cancelled) setDebrief(saved);
      })
      .catch((error) => {
        console.error("Failed to load debrief", error);
      });
    return () => {
      cancelled = true;
    };
  }, [initialized, today]);

  const keyConfigured = hasAiKey(settings);
  const hasActivity = todayEntries.length > 0;

  async function handleGenerate() {
    setGenerating(true);
    try {
      const stats = calculateTodayStats({
        date: today,
        tasks: allTasks,
        timeEntries: todayEntries,
        categories,
        now
      });
      const content = await generateDebrief(settings, {
        date: today,
        tasks: allTasks,
        entries: todayEntries,
        stats,
        language: settings.aiLanguage
      });
      const saved = await debriefRepository.save({
        date: today,
        content,
        provider: settings.aiProvider,
        model: resolveModel(settings)
      });
      setDebrief(saved);
    } catch (error) {
      console.error("Failed to generate debrief", error);
      addToast({
        kind: "error",
        title: "Debrief failed",
        description: error instanceof Error ? error.message : "Unknown AI error"
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card
      className="mb-4"
      header={
        <>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Daily debrief
          </div>
          {debrief ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={generating}
              onClick={() => void handleGenerate()}
              aria-label="Regenerate debrief"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Regenerate
            </Button>
          ) : null}
        </>
      }
    >
      {debrief ? (
        <DebriefContent content={debrief.content} />
      ) : !keyConfigured ? (
        <p className="text-sm text-muted-foreground">
          Connect an AI provider in Settings → AI to get an end-of-day read on
          where your time went and one thing to change tomorrow.
        </p>
      ) : !hasActivity ? (
        <p className="text-sm text-muted-foreground">
          Once you log some focus time today, generate a debrief to see where
          the day actually went.
        </p>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Turn today&apos;s sessions and stop-notes into a short, honest
            reflection.
          </p>
          <Button
            type="button"
            size="sm"
            variant="soft"
            loading={generating}
            onClick={() => void handleGenerate()}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Generate debrief
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * Minimal renderer for the debrief's constrained Markdown (## headings,
 * paragraphs, simple lists) — avoids pulling in a full Markdown library.
 */
function DebriefContent({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);

  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("## ")) {
          const [heading, ...rest] = trimmed.split("\n");
          return (
            <div key={index} className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {heading.replace(/^##\s+/, "")}
              </h4>
              {rest.length > 0 ? (
                <p className="text-sm leading-relaxed text-foreground">
                  {rest.join(" ")}
                </p>
              ) : null}
            </div>
          );
        }
        if (trimmed.startsWith("- ")) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {trimmed.split("\n").map((line, lineIndex) => (
                <li key={lineIndex}>{line.replace(/^-\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="text-sm leading-relaxed text-foreground">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
