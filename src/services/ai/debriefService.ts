import type { Task, TimeEntryWithTask, TodayStats } from "../../types";
import { formatDurationCompact } from "../../utils/duration";
import { generateText } from "./aiClient";
import type { AiSettings } from "./providers";

export type DebriefData = {
  date: string;
  tasks: Task[];
  entries: TimeEntryWithTask[];
  stats: TodayStats | null;
};

export const DEBRIEF_SYSTEM_PROMPT = [
  "You are the reflection companion inside Yolo, a desktop app whose motto is \"make your time count\".",
  "You receive an honest record of one person's day: their tasks, focus sessions, stop-notes, blockers, and estimate-vs-actual numbers.",
  "Write a short end-of-day debrief in Markdown with exactly these three sections:",
  "## Where the time went — 2-3 sentences on how the day actually unfolded, naming the dominant categories or tasks.",
  "## Estimate vs reality — point out the clearest gaps between planned and actual time, and any recurring blockers from the notes. If there is too little data, say so honestly.",
  "## One change for tomorrow — a single, concrete, small suggestion grounded in today's record. Never more than one.",
  "Tone: warm but candid, like a coach who respects the user's time. No filler praise, no generic productivity advice, no bullet spam.",
  "Keep the whole debrief under 180 words. Refer to tasks by their titles."
].join("\n");

function formatMinutes(seconds: number): string {
  return seconds > 0 ? formatDurationCompact(seconds) : "0m";
}

function describeEntry(entry: TimeEntryWithTask): string {
  const lines: string[] = [];
  const duration = entry.duration_seconds ?? 0;
  const time = entry.start_at.slice(11, 16);
  lines.push(
    `- ${time} · "${entry.task_title}" (${entry.category_name ?? "Inbox"}) — ${formatMinutes(duration)}` +
      (entry.end_at ? "" : " (still running)")
  );
  if (entry.note) lines.push(`  did: ${entry.note}`);
  if (entry.blocker) lines.push(`  blocker: ${entry.blocker}`);
  if (entry.next_action) lines.push(`  next: ${entry.next_action}`);
  if (entry.completion_rate !== null) lines.push(`  felt completion: ${entry.completion_rate}%`);
  return lines.join("\n");
}

function describeTask(task: Task): string {
  const estimate = task.estimated_minutes ? `, est ${task.estimated_minutes}m` : "";
  return `- "${task.title}" [${task.status}, ${task.priority}${estimate}]`;
}

export function buildDebriefPrompt(data: DebriefData): string {
  const sections: string[] = [`Date: ${data.date}`];

  if (data.stats) {
    const stats = data.stats;
    const categories = stats.categoryStats
      .map((category) => `${category.categoryName} ${formatMinutes(category.totalSeconds)}`)
      .join(", ");
    sections.push(
      [
        "Day totals:",
        `- Focused time: ${formatMinutes(stats.totalFocusSeconds)}`,
        `- Planned (estimates): ${formatMinutes(stats.estimatedSeconds)}`,
        `- Tasks completed: ${stats.completedTaskCount}, dropped: ${stats.droppedTaskCount}`,
        categories.length > 0 ? `- By category: ${categories}` : null
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (data.tasks.length > 0) {
    sections.push(["Today's task list:", ...data.tasks.map(describeTask)].join("\n"));
  }

  if (data.entries.length > 0) {
    // Entries arrive newest-first from the repository; chronological reads better.
    const chronological = [...data.entries].reverse();
    sections.push(
      ["Focus sessions (with stop-notes):", ...chronological.map(describeEntry)].join("\n")
    );
  } else {
    sections.push("No focus sessions were recorded today.");
  }

  sections.push("Write the debrief for this day.");
  return sections.join("\n\n");
}

export async function generateDebrief(settings: AiSettings, data: DebriefData): Promise<string> {
  return generateText(settings, {
    system: DEBRIEF_SYSTEM_PROMPT,
    prompt: buildDebriefPrompt(data)
  });
}
