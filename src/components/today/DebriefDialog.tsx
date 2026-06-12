import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { debriefRepository } from "../../db/debriefRepository";
import { hasAiKey } from "../../services/ai/aiClient";
import { runTodayDebrief } from "../../services/ai/debriefRunner";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { useUiStore } from "../../stores/uiStore";
import type { DailyDebrief } from "../../types";
import { formatDateLabel, toDateKey } from "../../utils/date";
import { Button } from "../ui/Button";
import { Dialog, DialogDescription, DialogTitle } from "../ui/Dialog";

/**
 * Daily debrief dialog: shows today's saved debrief, or generates one from
 * today's tasks, sessions, and stop-notes. Opened from the Today page button
 * or the toast that follows a scheduled auto-debrief.
 */
export function DebriefDialog() {
  const open = useUiStore((state) => state.debriefDialogOpen);
  const setOpen = useUiStore((state) => state.setDebriefDialogOpen);
  const addToast = useUiStore((state) => state.addToast);
  const settings = useSettingsStore((state) => state.settings);
  const todayEntries = useTaskStore((state) => state.todayEntries);
  const now = useTimerStore((state) => state.now);

  const today = toDateKey(now);
  const [debrief, setDebrief] = useState<DailyDebrief | null>(null);
  const [generating, setGenerating] = useState(false);

  // Re-read on every open so a scheduler-generated debrief shows up.
  useEffect(() => {
    if (!open) return;
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
  }, [open, today]);

  const keyConfigured = hasAiKey(settings);
  const hasActivity = todayEntries.length > 0;

  async function handleGenerate() {
    setGenerating(true);
    try {
      setDebrief(await runTodayDebrief(now));
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
    <Dialog open={open} onClose={() => setOpen(false)} size="md" align="top">
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                Daily debrief
              </span>
            </DialogTitle>
            <DialogDescription className="mt-1">
              {formatDateLabel(today)}
            </DialogDescription>
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
        </div>

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
      </div>
    </Dialog>
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
