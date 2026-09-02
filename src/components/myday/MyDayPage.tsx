import { isTauri } from "@tauri-apps/api/core";
import { AlertTriangle, Copy, Download, Share2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { debriefRepository } from "../../db/debriefRepository";
import { timeEntryRepository } from "../../db/timeEntryRepository";
import { useAsyncResource } from "../../hooks/useAsyncResource";
import { hasAiKey } from "../../services/ai/aiClient";
import { debriefInputHashForEntries, runDebrief } from "../../services/ai/debriefRunner";
import {
  captureElementToPng,
  copyDayImage,
  saveDayImage
} from "../../services/share/shareImage";
import { calculateTodayStats } from "../../services/statsService";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTimerStore } from "../../stores/timerStore";
import { useUiStore } from "../../stores/uiStore";
import type { DailyDebrief, TimeEntryWithTask } from "../../types";
import { toDateKey } from "../../utils/date";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Menu, MenuItem } from "../ui/Menu";
import { PageHeader } from "../ui/PageHeader";
import { Skeleton } from "../ui/Skeleton";
import { CategoryDonut } from "./CategoryDonut";
import { DateNavigator } from "./DateNavigator";
import { DayStory } from "./DayStory";
import { DayTimeline } from "./DayTimeline";
import { EstimateVsActual } from "./EstimateVsActual";
import { HeroStatBand } from "./HeroStatBand";
import { SessionList } from "./SessionList";
import { ShareCard } from "./ShareCard";

/**
 * "My Day" — a premium, chart-led review of a single day. Charts are always
 * available from local data; the AI narrates on top. Defaults to today and
 * steps back through past days via the date navigator.
 */
export function MyDayPage() {
  const settings = useSettingsStore((state) => state.settings);
  const allTasks = useTaskStore((state) => state.allTasks);
  const todayEntries = useTaskStore((state) => state.todayEntries);
  const categories = useTaskStore((state) => state.categories);
  const now = useTimerStore((state) => state.now);
  const addToast = useUiStore((state) => state.addToast);

  const today = toDateKey(now);
  const [viewDate, setViewDate] = useState(today);
  const isToday = viewDate === today;

  const [debrief, setDebrief] = useState<DailyDebrief | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  // Today reads the live store (so a running session counts); past days load
  // their sessions from the repository.
  const past = useAsyncResource<TimeEntryWithTask[]>(
    () => timeEntryRepository.getEntriesForDate(viewDate, new Date().toISOString()),
    [],
    [viewDate, isToday],
    {
      enabled: !isToday,
      onError: (error) => {
        console.error("Failed to load sessions for day", error);
        addToast({
          kind: "error",
          title: "Couldn't load that day",
          description: "We hit a problem reading those sessions. Try again."
        });
      }
    }
  );
  const entries = isToday ? todayEntries : past.data;

  // Re-read the saved debrief whenever the viewed day changes.
  useEffect(() => {
    let cancelled = false;
    debriefRepository
      .getForDate(viewDate)
      .then((saved) => {
        if (!cancelled) setDebrief(saved);
      })
      .catch((error) => {
        console.error("Failed to load debrief", error);
      });
    return () => {
      cancelled = true;
    };
  }, [viewDate]);

  const stats = useMemo(
    () =>
      calculateTodayStats({
        date: viewDate,
        tasks: allTasks,
        timeEntries: entries,
        categories,
        now
      }),
    [viewDate, allTasks, entries, categories, now]
  );

  // Fingerprint of the day's data as it stands now; when it diverges from the
  // saved debrief's hash, regenerating would actually produce something new.
  const currentHash = useMemo(
    () => debriefInputHashForEntries(viewDate, entries, now),
    [viewDate, entries, now]
  );
  const dataChanged = debrief !== null && debrief.input_hash !== currentHash;

  const keyConfigured = hasAiKey(settings);
  const hasActivity = entries.length > 0;

  async function handleGenerate() {
    setGenerating(true);
    try {
      setDebrief(await runDebrief(viewDate, new Date()));
    } catch (error) {
      console.error("Failed to generate debrief", error);
      addToast({
        kind: "error",
        title: "Story failed",
        description: error instanceof Error ? error.message : "Unknown AI error"
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleExport(mode: "save" | "copy") {
    if (!isTauri()) {
      addToast({
        kind: "info",
        title: "Export needs the desktop app",
        description: "Open Yolo as the desktop app to save or copy your day."
      });
      return;
    }
    const node = shareCardRef.current;
    if (!node) return;

    setExporting(true);
    try {
      const bytes = await captureElementToPng(node);
      if (mode === "save") {
        const path = await saveDayImage(bytes, viewDate);
        if (path) {
          addToast({ kind: "success", title: "Image saved", description: path });
        }
      } else {
        await copyDayImage(bytes);
        addToast({ kind: "success", title: "Image copied", description: "Paste it into your post." });
      }
    } catch (error) {
      console.error("Failed to export day image", error);
      addToast({
        kind: "error",
        title: "Export failed",
        description: error instanceof Error ? error.message : "Could not create the image"
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page-scroll px-6 py-7">
      <PageHeader
        icon={Sparkles}
        eyebrow="My Day"
        title="Day in review"
        actions={
          <>
            <DateNavigator date={viewDate} today={today} onChange={setViewDate} />
            <Menu
              align="end"
              trigger={
                <Button type="button" size="sm" variant="secondary" loading={exporting} disabled={!hasActivity || past.loading}>
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                  Share
                </Button>
              }
            >
              <MenuItem icon={Download} onSelect={() => void handleExport("save")}>
                Save as image
              </MenuItem>
              <MenuItem icon={Copy} onSelect={() => void handleExport("copy")}>
                Copy image
              </MenuItem>
            </Menu>
          </>
        }
      />

      <div className="mx-auto max-w-4xl space-y-5">
        {past.loading ? (
          <MyDaySkeleton />
        ) : past.error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load this day"
            hint="Something went wrong reading this day's sessions."
            action={
              <Button type="button" size="sm" variant="secondary" onClick={past.reload}>
                Try again
              </Button>
            }
            dashed
          />
        ) : (
          <>
            <HeroStatBand stats={stats} />

            <DayStory
              debrief={debrief}
              keyConfigured={keyConfigured}
              hasActivity={hasActivity}
              dataChanged={dataChanged}
              generating={generating}
              isToday={isToday}
              onGenerate={() => void handleGenerate()}
            />

            <DayTimeline entries={entries} date={viewDate} now={now} />

            <div className="grid gap-5 lg:grid-cols-2">
              <CategoryDonut stats={stats} />
              <EstimateVsActual stats={stats} />
            </div>

            <SessionList entries={entries} />
          </>
        )}
      </div>

      {/* Offscreen render target for image export. Kept laid out (not
          display:none) so html-to-image can measure and capture it. */}
      <div aria-hidden style={{ position: "fixed", top: 0, left: -100000, pointerEvents: "none" }}>
        <ShareCard ref={shareCardRef} date={viewDate} stats={stats} entries={entries} debrief={debrief} now={now} />
      </div>
    </div>
  );
}

/** Placeholder shown while a past day's sessions load, matching the layout. */
function MyDaySkeleton() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  );
}
