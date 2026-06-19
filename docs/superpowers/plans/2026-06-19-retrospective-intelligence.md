# Retrospective Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Yolo chat assistant a history-aware retrospective layer — deterministic analytics over real time records (estimation calibration, slip/blocker analysis, weekly review) that the assistant narrates and applies when planning.

**Architecture:** A new pure `src/services/retrospect/` module computes a compact `RetrospectiveInsights` facts object from time entries + tasks. The assistant store loads it once per session and passes it through `runAssistantTurn` → `buildAssistantContext` → `buildAssistantSystemPrompt`, where it is rendered as bounded facts plus honesty/calibration rules. The LLM never sees raw rows and never does math. All edits to existing files are additive.

**Tech Stack:** TypeScript, Zustand, Vitest. Reuses `timeEntryRepository.getEntriesForRange`, `taskRepository.getAll`, and `src/utils/date` helpers.

---

## File Structure

**New — `src/services/retrospect/` (pure compute + one impure loader):**
- `types.ts` — `RetrospectiveInsights` and its sub-types. No runtime behavior.
- `calibration.ts` — `computeEstimationCalibration(entries)`. Pure.
- `slips.ts` — `computeSlipAnalysis(tasks, entries, now)`. Pure.
- `weeklyReview.ts` — `computeWeeklyReview(thisWeek, lastWeek, tasks, now)`. Pure.
- `loadHistory.ts` — `loadRetrospectiveData(now, windowDays)`. The only impure file (DB).
- `index.ts` — `buildRetrospectiveInsights(now)` orchestrator.

**Modified (additive):**
- `src/services/ai/assistant/types.ts` — add optional `retro` to `AssistantContext`.
- `src/services/ai/assistant/contextBuilder.ts` — accept insights, attach `retro`.
- `src/services/ai/assistant/systemPrompt.ts` — render the retro block + rules.
- `src/services/ai/assistant/assistantRunner.ts` — thread `insights` through.
- `src/stores/assistantStore.ts` — load/cache insights, pass into the runner.

Design choice: insights are **lazy-loaded once per session inside `send()`** and cached (cleared via `refreshInsights`). This guarantees availability without wiring panel-open effects, at the cost of a one-time fetch before the first reply.

---

## Task 1: Retrospect types

**Files:**
- Create: `src/services/retrospect/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/services/retrospect/types.ts

/** Whether an insight has enough samples to state confidently. */
export type Confidence = "ok" | "low";

/** Estimate-vs-actual for one scope (overall or a single category). */
export type CalibrationStat = {
  scope: string; // "overall" or a category name
  estimatedMinutes: number;
  actualMinutes: number;
  ratio: number; // actualMinutes / estimatedMinutes
  sampleSize: number; // number of qualifying tasks
  confidence: Confidence;
};

export type EstimationCalibration = {
  overall: CalibrationStat | null; // null when no qualifying data
  byCategory: CalibrationStat[];
};

export type SlipItem = {
  taskId: string;
  title: string;
  kind: "overdue" | "lingering" | "dropped";
  ageDays: number;
};

export type BlockerTheme = {
  keyword: string;
  count: number;
};

export type SlipAnalysis = {
  items: SlipItem[]; // top N by ageDays
  moreCount: number; // qualifying slips beyond the top N
  blockerThemes: BlockerTheme[];
};

export type CategoryDelta = {
  category: string;
  thisWeekMinutes: number;
  lastWeekMinutes: number;
  deltaMinutes: number; // thisWeek - lastWeek
};

export type WeeklyReview = {
  thisWeekMinutes: number;
  lastWeekMinutes: number;
  deltaMinutes: number;
  categoryDeltas: CategoryDelta[]; // top movers by abs(delta)
  completedCount: number; // tasks completed in the last 7 days
  droppedCount: number; // tasks dropped in the last 7 days
};

export type RetrospectiveInsights = {
  windowDays: number;
  hasData: boolean;
  calibration: EstimationCalibration;
  slips: SlipAnalysis;
  weekly: WeeklyReview;
};
```

- [ ] **Step 2: Verify it compiles**

Run: `yarn test src/services/retrospect 2>/dev/null; yarn tsc --noEmit`
Expected: no type errors referencing `types.ts` (vitest may report "no test files", which is fine here).

- [ ] **Step 3: Commit**

```bash
git add src/services/retrospect/types.ts
git commit -m "feat: retrospective insights types"
```

---

## Task 2: Estimation calibration

**Files:**
- Create: `src/services/retrospect/calibration.ts`
- Test: `src/services/retrospect/calibration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/retrospect/calibration.test.ts
import { describe, expect, it } from "vitest";
import type { TimeEntryWithTask } from "../../types";
import { computeEstimationCalibration } from "./calibration";

function entry(over: Partial<TimeEntryWithTask>): TimeEntryWithTask {
  return {
    id: "e",
    task_id: "t",
    start_at: "2026-06-01T09:00:00.000Z",
    end_at: "2026-06-01T10:00:00.000Z",
    duration_seconds: 3600,
    note: null,
    blocker: null,
    next_action: null,
    completion_rate: null,
    created_at: "2026-06-01T09:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    task_title: "Task",
    task_estimated_minutes: 60,
    category_id: "c1",
    category_name: "Deep Work",
    category_color: "#000",
    ...over
  };
}

describe("computeEstimationCalibration", () => {
  it("returns null overall when no entry has an estimate", () => {
    const result = computeEstimationCalibration([entry({ task_estimated_minutes: null })]);
    expect(result.overall).toBeNull();
    expect(result.byCategory).toEqual([]);
  });

  it("aggregates actual vs estimate across entries of the same task", () => {
    const entries = [
      entry({ task_id: "t1", duration_seconds: 1800, task_estimated_minutes: 60 }),
      entry({ task_id: "t1", duration_seconds: 1800, task_estimated_minutes: 60 })
    ];
    const result = computeEstimationCalibration(entries);
    expect(result.overall).not.toBeNull();
    // one task: 60 min estimate, 60 min actual -> ratio 1
    expect(result.overall?.estimatedMinutes).toBe(60);
    expect(result.overall?.actualMinutes).toBe(60);
    expect(result.overall?.ratio).toBeCloseTo(1);
    expect(result.overall?.sampleSize).toBe(1);
    expect(result.overall?.confidence).toBe("low");
  });

  it("marks confidence ok at or above the sample threshold and groups by category", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry({ task_id: `t${i}`, duration_seconds: 5400, task_estimated_minutes: 60 })
    );
    const result = computeEstimationCalibration(entries);
    expect(result.overall?.sampleSize).toBe(5);
    expect(result.overall?.confidence).toBe("ok");
    expect(result.overall?.ratio).toBeCloseTo(1.5); // 90m actual / 60m est
    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0].scope).toBe("Deep Work");
  });

  it("ignores tasks with no meaningful tracked time", () => {
    const result = computeEstimationCalibration([entry({ duration_seconds: 30 })]);
    expect(result.overall).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/retrospect/calibration.test.ts`
Expected: FAIL — `computeEstimationCalibration` is not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/retrospect/calibration.ts
import type { TimeEntryWithTask } from "../../types";
import type { CalibrationStat, EstimationCalibration } from "./types";

const MIN_TASKS_FOR_CONFIDENCE = 5;
const MIN_MEANINGFUL_SECONDS = 60;
const UNCATEGORIZED = "Uncategorized";

type TaskAccumulator = {
  estimatedMinutes: number;
  actualSeconds: number;
  category: string;
};

function buildStat(scope: string, tasks: TaskAccumulator[]): CalibrationStat | null {
  if (tasks.length === 0) return null;
  const estimatedMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const actualMinutes = Math.round(tasks.reduce((sum, t) => sum + t.actualSeconds, 0) / 60);
  if (estimatedMinutes === 0) return null;
  return {
    scope,
    estimatedMinutes,
    actualMinutes,
    ratio: actualMinutes / estimatedMinutes,
    sampleSize: tasks.length,
    confidence: tasks.length >= MIN_TASKS_FOR_CONFIDENCE ? "ok" : "low"
  };
}

export function computeEstimationCalibration(entries: TimeEntryWithTask[]): EstimationCalibration {
  const byTask = new Map<string, TaskAccumulator>();

  for (const entry of entries) {
    if (entry.task_estimated_minutes == null || entry.task_estimated_minutes <= 0) continue;
    const existing = byTask.get(entry.task_id);
    const seconds = entry.duration_seconds ?? 0;
    if (existing) {
      existing.actualSeconds += seconds;
    } else {
      byTask.set(entry.task_id, {
        estimatedMinutes: entry.task_estimated_minutes,
        actualSeconds: seconds,
        category: entry.category_name ?? UNCATEGORIZED
      });
    }
  }

  const qualifying = [...byTask.values()].filter((t) => t.actualSeconds >= MIN_MEANINGFUL_SECONDS);

  const byCategoryMap = new Map<string, TaskAccumulator[]>();
  for (const task of qualifying) {
    const list = byCategoryMap.get(task.category) ?? [];
    list.push(task);
    byCategoryMap.set(task.category, list);
  }

  const byCategory = [...byCategoryMap.entries()]
    .map(([category, tasks]) => buildStat(category, tasks))
    .filter((stat): stat is CalibrationStat => stat !== null);

  return { overall: buildStat("overall", qualifying), byCategory };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/retrospect/calibration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/retrospect/calibration.ts src/services/retrospect/calibration.test.ts
git commit -m "feat: estimation calibration analytics"
```

---

## Task 3: Slip & blocker analysis

**Files:**
- Create: `src/services/retrospect/slips.ts`
- Test: `src/services/retrospect/slips.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/retrospect/slips.test.ts
import { describe, expect, it } from "vitest";
import type { Task, TimeEntryWithTask } from "../../types";
import { computeSlipAnalysis } from "./slips";

const NOW = new Date("2026-06-19T12:00:00.000Z");

function task(over: Partial<Task>): Task {
  return {
    id: "t",
    title: "Task",
    description: null,
    category_id: null,
    status: "todo",
    priority: "medium",
    estimated_minutes: null,
    due_date: null,
    template_id: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    created_at: "2026-06-19T12:00:00.000Z",
    updated_at: "2026-06-19T12:00:00.000Z",
    completed_at: null,
    dropped_at: null,
    ...over
  };
}

function entryWithBlocker(blocker: string | null): TimeEntryWithTask {
  return {
    id: "e",
    task_id: "t",
    start_at: "2026-06-18T09:00:00.000Z",
    end_at: "2026-06-18T10:00:00.000Z",
    duration_seconds: 3600,
    note: null,
    blocker,
    next_action: null,
    completion_rate: null,
    created_at: "2026-06-18T09:00:00.000Z",
    updated_at: "2026-06-18T10:00:00.000Z",
    task_title: "Task",
    task_estimated_minutes: 60,
    category_id: null,
    category_name: null,
    category_color: null
  };
}

describe("computeSlipAnalysis", () => {
  it("flags overdue todo tasks", () => {
    const result = computeSlipAnalysis(
      [task({ id: "a", title: "Pay invoice", due_date: "2026-06-10" })],
      [],
      NOW
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("overdue");
    expect(result.items[0].taskId).toBe("a");
  });

  it("flags lingering old todo tasks with no due date", () => {
    const result = computeSlipAnalysis(
      [task({ id: "b", title: "Old idea", created_at: "2026-05-01T12:00:00.000Z" })],
      [],
      NOW
    );
    expect(result.items[0].kind).toBe("lingering");
  });

  it("ignores fresh todo tasks", () => {
    const result = computeSlipAnalysis([task({ created_at: "2026-06-18T12:00:00.000Z" })], [], NOW);
    expect(result.items).toHaveLength(0);
  });

  it("flags long-lived dropped tasks and caps to top 3 with a remainder", () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      task({
        id: `d${i}`,
        status: "dropped",
        created_at: "2026-05-01T12:00:00.000Z",
        dropped_at: "2026-06-15T12:00:00.000Z"
      })
    );
    const result = computeSlipAnalysis(tasks, [], NOW);
    expect(result.items).toHaveLength(3);
    expect(result.moreCount).toBe(2);
    expect(result.items[0].kind).toBe("dropped");
  });

  it("themes recurring blocker keywords seen at least twice", () => {
    const result = computeSlipAnalysis(
      [],
      [entryWithBlocker("waiting on design review"), entryWithBlocker("blocked by design feedback")],
      NOW
    );
    expect(result.blockerThemes.map((t) => t.keyword)).toContain("design");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/retrospect/slips.test.ts`
Expected: FAIL — `computeSlipAnalysis` is not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/retrospect/slips.ts
import type { Task, TimeEntryWithTask } from "../../types";
import { toDateKey } from "../../utils/date";
import type { BlockerTheme, SlipAnalysis, SlipItem } from "./types";

const LINGER_DAYS = 14;
const DROPPED_MIN_LIFETIME_DAYS = 14;
const TOP_SLIPS = 3;
const TOP_THEMES = 3;
const MIN_THEME_COUNT = 2;
const MIN_KEYWORD_LENGTH = 4;

const STOPWORDS = new Set([
  "waiting",
  "blocked",
  "still",
  "need",
  "needed",
  "with",
  "from",
  "that",
  "this",
  "have",
  "about",
  "could",
  "would",
  "their",
  "there"
]);

function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return 0;
  return Math.floor((to.getTime() - from) / 86_400_000);
}

function classifyTask(task: Task, now: Date): SlipItem | null {
  const todayKey = toDateKey(now);

  if (task.status === "dropped") {
    if (!task.dropped_at) return null;
    const lifetime = daysBetween(task.created_at, new Date(task.dropped_at));
    if (lifetime < DROPPED_MIN_LIFETIME_DAYS) return null;
    return { taskId: task.id, title: task.title, kind: "dropped", ageDays: lifetime };
  }

  if (task.status === "done") return null;

  // Open task (todo / doing / paused): overdue takes priority over lingering.
  if (task.due_date && task.due_date < todayKey) {
    return { taskId: task.id, title: task.title, kind: "overdue", ageDays: daysBetween(task.created_at, now) };
  }

  const age = daysBetween(task.created_at, now);
  if (age >= LINGER_DAYS) {
    return { taskId: task.id, title: task.title, kind: "lingering", ageDays: age };
  }

  return null;
}

function themeBlockers(entries: TimeEntryWithTask[]): BlockerTheme[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.blocker) continue;
    const seen = new Set<string>();
    for (const word of entry.blocker.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length < MIN_KEYWORD_LENGTH || STOPWORDS.has(word) || seen.has(word)) continue;
      seen.add(word);
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_THEME_COUNT)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_THEMES)
    .map(([keyword, count]) => ({ keyword, count }));
}

export function computeSlipAnalysis(
  tasks: Task[],
  entries: TimeEntryWithTask[],
  now: Date
): SlipAnalysis {
  const slips = tasks
    .map((task) => classifyTask(task, now))
    .filter((item): item is SlipItem => item !== null)
    .sort((a, b) => b.ageDays - a.ageDays);

  return {
    items: slips.slice(0, TOP_SLIPS),
    moreCount: Math.max(0, slips.length - TOP_SLIPS),
    blockerThemes: themeBlockers(entries)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/retrospect/slips.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/retrospect/slips.ts src/services/retrospect/slips.test.ts
git commit -m "feat: slip and blocker analysis"
```

---

## Task 4: Weekly review

**Files:**
- Create: `src/services/retrospect/weeklyReview.ts`
- Test: `src/services/retrospect/weeklyReview.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/retrospect/weeklyReview.test.ts
import { describe, expect, it } from "vitest";
import type { Task, TimeEntryWithTask } from "../../types";
import { computeWeeklyReview } from "./weeklyReview";

const NOW = new Date("2026-06-19T12:00:00.000Z");

function entry(over: Partial<TimeEntryWithTask>): TimeEntryWithTask {
  return {
    id: "e",
    task_id: "t",
    start_at: "2026-06-18T09:00:00.000Z",
    end_at: "2026-06-18T10:00:00.000Z",
    duration_seconds: 3600,
    note: null,
    blocker: null,
    next_action: null,
    completion_rate: null,
    created_at: "2026-06-18T09:00:00.000Z",
    updated_at: "2026-06-18T10:00:00.000Z",
    task_title: "Task",
    task_estimated_minutes: 60,
    category_id: "c1",
    category_name: "Deep Work",
    category_color: "#000",
    ...over
  };
}

function task(over: Partial<Task>): Task {
  return {
    id: "t",
    title: "Task",
    description: null,
    category_id: null,
    status: "done",
    priority: "medium",
    estimated_minutes: null,
    due_date: null,
    template_id: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-18T12:00:00.000Z",
    completed_at: null,
    dropped_at: null,
    ...over
  };
}

describe("computeWeeklyReview", () => {
  it("sums minutes per window and computes the delta", () => {
    const review = computeWeeklyReview(
      [entry({ duration_seconds: 3600 }), entry({ duration_seconds: 1800 })],
      [entry({ duration_seconds: 1800 })],
      [],
      NOW
    );
    expect(review.thisWeekMinutes).toBe(90);
    expect(review.lastWeekMinutes).toBe(30);
    expect(review.deltaMinutes).toBe(60);
  });

  it("ranks category movers by absolute delta", () => {
    const review = computeWeeklyReview(
      [entry({ category_name: "Deep Work", duration_seconds: 7200 })],
      [entry({ category_name: "Deep Work", duration_seconds: 1800 })],
      [],
      NOW
    );
    expect(review.categoryDeltas[0].category).toBe("Deep Work");
    expect(review.categoryDeltas[0].deltaMinutes).toBe(90); // 120 - 30
  });

  it("counts tasks completed and dropped in the last 7 days", () => {
    const review = computeWeeklyReview(
      [],
      [],
      [
        task({ status: "done", completed_at: "2026-06-17T12:00:00.000Z" }),
        task({ status: "done", completed_at: "2026-06-01T12:00:00.000Z" }), // older than 7d
        task({ status: "dropped", dropped_at: "2026-06-16T12:00:00.000Z" })
      ],
      NOW
    );
    expect(review.completedCount).toBe(1);
    expect(review.droppedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/retrospect/weeklyReview.test.ts`
Expected: FAIL — `computeWeeklyReview` is not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/retrospect/weeklyReview.ts
import type { Task, TimeEntryWithTask } from "../../types";
import type { CategoryDelta, WeeklyReview } from "./types";

const WEEK_MS = 7 * 86_400_000;
const TOP_MOVERS = 3;
const UNCATEGORIZED = "Uncategorized";

function totalMinutes(entries: TimeEntryWithTask[]): number {
  return Math.round(entries.reduce((sum, e) => sum + (e.duration_seconds ?? 0), 0) / 60);
}

function minutesByCategory(entries: TimeEntryWithTask[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.category_name ?? UNCATEGORIZED;
    map.set(key, (map.get(key) ?? 0) + (entry.duration_seconds ?? 0));
  }
  return new Map([...map.entries()].map(([k, seconds]) => [k, Math.round(seconds / 60)]));
}

function withinLastWeek(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && now.getTime() - t <= WEEK_MS && t <= now.getTime();
}

export function computeWeeklyReview(
  thisWeek: TimeEntryWithTask[],
  lastWeek: TimeEntryWithTask[],
  tasks: Task[],
  now: Date
): WeeklyReview {
  const thisByCat = minutesByCategory(thisWeek);
  const lastByCat = minutesByCategory(lastWeek);
  const categories = new Set([...thisByCat.keys(), ...lastByCat.keys()]);

  const categoryDeltas: CategoryDelta[] = [...categories]
    .map((category) => {
      const thisWeekMinutes = thisByCat.get(category) ?? 0;
      const lastWeekMinutes = lastByCat.get(category) ?? 0;
      return { category, thisWeekMinutes, lastWeekMinutes, deltaMinutes: thisWeekMinutes - lastWeekMinutes };
    })
    .sort((a, b) => Math.abs(b.deltaMinutes) - Math.abs(a.deltaMinutes))
    .slice(0, TOP_MOVERS);

  const thisWeekMinutes = totalMinutes(thisWeek);
  const lastWeekMinutes = totalMinutes(lastWeek);

  return {
    thisWeekMinutes,
    lastWeekMinutes,
    deltaMinutes: thisWeekMinutes - lastWeekMinutes,
    categoryDeltas,
    completedCount: tasks.filter((t) => withinLastWeek(t.completed_at, now)).length,
    droppedCount: tasks.filter((t) => withinLastWeek(t.dropped_at, now)).length
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/retrospect/weeklyReview.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/retrospect/weeklyReview.ts src/services/retrospect/weeklyReview.test.ts
git commit -m "feat: weekly review analytics"
```

---

## Task 5: History loader + orchestrator

**Files:**
- Create: `src/services/retrospect/loadHistory.ts`
- Create: `src/services/retrospect/index.ts`
- Test: `src/services/retrospect/index.test.ts`

- [ ] **Step 1: Write the loader (impure boundary)**

```typescript
// src/services/retrospect/loadHistory.ts
import { taskRepository } from "../../db/taskRepository";
import { timeEntryRepository } from "../../db/timeEntryRepository";
import type { Task, TimeEntryWithTask } from "../../types";

export type RetrospectiveData = {
  entries: TimeEntryWithTask[];
  tasks: Task[];
};

/** Fetch the trailing window of time entries plus all tasks. Impure boundary. */
export async function loadRetrospectiveData(now: Date, windowDays: number): Promise<RetrospectiveData> {
  const start = new Date(now.getTime() - windowDays * 86_400_000);
  const [entries, tasks] = await Promise.all([
    timeEntryRepository.getEntriesForRange(start.toISOString(), now.toISOString(), now.toISOString()),
    taskRepository.getAll()
  ]);
  return { entries, tasks };
}
```

- [ ] **Step 2: Write the failing orchestrator test**

```typescript
// src/services/retrospect/index.test.ts
import { describe, expect, it, vi } from "vitest";
import type { Task, TimeEntryWithTask } from "../../types";
import { buildRetrospectiveInsights } from "./index";
import * as loader from "./loadHistory";

const NOW = new Date("2026-06-19T12:00:00.000Z");

function entry(startAt: string, over: Partial<TimeEntryWithTask> = {}): TimeEntryWithTask {
  return {
    id: "e",
    task_id: "t1",
    start_at: startAt,
    end_at: startAt,
    duration_seconds: 3600,
    note: null,
    blocker: null,
    next_action: null,
    completion_rate: null,
    created_at: startAt,
    updated_at: startAt,
    task_title: "Task",
    task_estimated_minutes: 60,
    category_id: "c1",
    category_name: "Deep Work",
    category_color: "#000",
    ...over
  };
}

describe("buildRetrospectiveInsights", () => {
  it("reports hasData=false when there is no history", async () => {
    vi.spyOn(loader, "loadRetrospectiveData").mockResolvedValue({ entries: [], tasks: [] });
    const insights = await buildRetrospectiveInsights(NOW);
    expect(insights.hasData).toBe(false);
    expect(insights.windowDays).toBe(30);
  });

  it("partitions entries into this-week and last-week buckets", async () => {
    const tasks: Task[] = [];
    vi.spyOn(loader, "loadRetrospectiveData").mockResolvedValue({
      entries: [
        entry("2026-06-18T09:00:00.000Z", { duration_seconds: 3600 }), // this week
        entry("2026-06-10T09:00:00.000Z", { duration_seconds: 1800 }) // last week
      ],
      tasks
    });
    const insights = await buildRetrospectiveInsights(NOW);
    expect(insights.hasData).toBe(true);
    expect(insights.weekly.thisWeekMinutes).toBe(60);
    expect(insights.weekly.lastWeekMinutes).toBe(30);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn test src/services/retrospect/index.test.ts`
Expected: FAIL — `buildRetrospectiveInsights` is not exported.

- [ ] **Step 4: Write the orchestrator**

```typescript
// src/services/retrospect/index.ts
import type { TimeEntryWithTask } from "../../types";
import { computeEstimationCalibration } from "./calibration";
import { loadRetrospectiveData } from "./loadHistory";
import { computeSlipAnalysis } from "./slips";
import type { RetrospectiveInsights } from "./types";
import { computeWeeklyReview } from "./weeklyReview";

export type { RetrospectiveInsights } from "./types";

const WINDOW_DAYS = 30;
const WEEK_MS = 7 * 86_400_000;

function partitionWeeks(entries: TimeEntryWithTask[], now: Date) {
  const thisWeek: TimeEntryWithTask[] = [];
  const lastWeek: TimeEntryWithTask[] = [];
  for (const entry of entries) {
    const age = now.getTime() - new Date(entry.start_at).getTime();
    if (age < 0) continue;
    if (age <= WEEK_MS) thisWeek.push(entry);
    else if (age <= 2 * WEEK_MS) lastWeek.push(entry);
  }
  return { thisWeek, lastWeek };
}

export async function buildRetrospectiveInsights(now = new Date()): Promise<RetrospectiveInsights> {
  const { entries, tasks } = await loadRetrospectiveData(now, WINDOW_DAYS);
  const calibration = computeEstimationCalibration(entries);
  const slips = computeSlipAnalysis(tasks, entries, now);
  const { thisWeek, lastWeek } = partitionWeeks(entries, now);
  const weekly = computeWeeklyReview(thisWeek, lastWeek, tasks, now);

  const hasData = entries.length > 0 || slips.items.length > 0;

  return { windowDays: WINDOW_DAYS, hasData, calibration, slips, weekly };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/services/retrospect/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/services/retrospect/loadHistory.ts src/services/retrospect/index.ts src/services/retrospect/index.test.ts
git commit -m "feat: retrospective insights orchestrator"
```

---

## Task 6: Thread insights into the assistant context

**Files:**
- Modify: `src/services/ai/assistant/types.ts`
- Modify: `src/services/ai/assistant/contextBuilder.ts`
- Test: `src/services/ai/assistant/contextBuilder.test.ts` (create if absent)

- [ ] **Step 1: Add `retro` to `AssistantContext`**

In `src/services/ai/assistant/types.ts`, add the import and the optional field:

```typescript
import type { CreateTaskInput, TaskPriority, TaskStatus } from "../../../types";
import type { RetrospectiveInsights } from "../../retrospect/types";
import type { ChatRole } from "../providers";
```

Then extend `AssistantContext` (add the final optional property):

```typescript
export type AssistantContext = {
  today: string; // date key YYYY-MM-DD
  categories: { id: string; name: string }[];
  tasks: ContextTask[]; // today's tasks
  backlog: ContextTask[]; // capped slice of backlog
  retro?: RetrospectiveInsights; // present only when there is history to report
};
```

- [ ] **Step 2: Write the failing contextBuilder test**

```typescript
// src/services/ai/assistant/contextBuilder.test.ts
import { describe, expect, it } from "vitest";
import type { RetrospectiveInsights } from "../../retrospect/types";
import { buildAssistantContext, type AssistantStoreSnapshot } from "./contextBuilder";

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-19",
  tasks: [],
  backlogTasks: [],
  categories: []
};

const insights: RetrospectiveInsights = {
  windowDays: 30,
  hasData: true,
  calibration: { overall: null, byCategory: [] },
  slips: { items: [], moreCount: 0, blockerThemes: [] },
  weekly: {
    thisWeekMinutes: 0,
    lastWeekMinutes: 0,
    deltaMinutes: 0,
    categoryDeltas: [],
    completedCount: 0,
    droppedCount: 0
  }
};

describe("buildAssistantContext", () => {
  it("omits retro when no insights are passed", () => {
    expect(buildAssistantContext(snapshot).retro).toBeUndefined();
  });

  it("omits retro when insights have no data", () => {
    expect(buildAssistantContext(snapshot, { ...insights, hasData: false }).retro).toBeUndefined();
  });

  it("attaches retro when insights have data", () => {
    expect(buildAssistantContext(snapshot, insights).retro).toBe(insights);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn test src/services/ai/assistant/contextBuilder.test.ts`
Expected: FAIL — `buildAssistantContext` takes one argument / returns no `retro`.

- [ ] **Step 4: Update `contextBuilder.ts`**

Add the import and the optional parameter:

```typescript
import type { Category, Task } from "../../../types";
import type { RetrospectiveInsights } from "../../retrospect/types";
import type { AssistantContext, ContextTask } from "./types";
```

Replace `buildAssistantContext` with:

```typescript
export function buildAssistantContext(
  snapshot: AssistantStoreSnapshot,
  insights?: RetrospectiveInsights | null
): AssistantContext {
  return {
    // The day the user is currently viewing (selectedDate), which the assistant treats as "today".
    today: snapshot.selectedDate,
    categories: snapshot.categories.map((category) => ({ id: category.id, name: category.name })),
    tasks: snapshot.tasks.map(toContextTask),
    backlog: snapshot.backlogTasks.slice(0, BACKLOG_CAP).map(toContextTask),
    ...(insights && insights.hasData ? { retro: insights } : {})
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/services/ai/assistant/contextBuilder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/assistant/types.ts src/services/ai/assistant/contextBuilder.ts src/services/ai/assistant/contextBuilder.test.ts
git commit -m "feat: thread retrospective insights into assistant context"
```

---

## Task 7: Render retro facts + rules in the system prompt

**Files:**
- Modify: `src/services/ai/assistant/systemPrompt.ts`
- Test: `src/services/ai/assistant/systemPrompt.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/assistant/systemPrompt.test.ts
import { describe, expect, it } from "vitest";
import type { RetrospectiveInsights } from "../../retrospect/types";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import type { AssistantContext } from "./types";

const base: AssistantContext = {
  today: "2026-06-19",
  categories: [],
  tasks: [],
  backlog: []
};

const insights: RetrospectiveInsights = {
  windowDays: 30,
  hasData: true,
  calibration: {
    overall: { scope: "overall", estimatedMinutes: 60, actualMinutes: 90, ratio: 1.5, sampleSize: 6, confidence: "ok" },
    byCategory: [
      { scope: "Deep Work", estimatedMinutes: 60, actualMinutes: 90, ratio: 1.5, sampleSize: 6, confidence: "ok" }
    ]
  },
  slips: {
    items: [{ taskId: "a", title: "Pay invoice", kind: "overdue", ageDays: 9 }],
    moreCount: 2,
    blockerThemes: [{ keyword: "design", count: 3 }]
  },
  weekly: {
    thisWeekMinutes: 600,
    lastWeekMinutes: 480,
    deltaMinutes: 120,
    categoryDeltas: [{ category: "Deep Work", thisWeekMinutes: 300, lastWeekMinutes: 180, deltaMinutes: 120 }],
    completedCount: 7,
    droppedCount: 1
  }
};

describe("buildAssistantSystemPrompt", () => {
  it("omits the history section when there is no retro", () => {
    expect(buildAssistantSystemPrompt(base)).not.toContain("History & patterns");
  });

  it("includes calibration facts and the honesty/calibration rules", () => {
    const prompt = buildAssistantSystemPrompt({ ...base, retro: insights });
    expect(prompt).toContain("History & patterns");
    expect(prompt).toContain("Deep Work");
    expect(prompt).toContain("1.5"); // ratio surfaced
    expect(prompt).toContain("Pay invoice"); // slip surfaced
    expect(prompt.toLowerCase()).toContain("calibrat"); // rule present
  });

  it("flags low-confidence calibration so the model hedges", () => {
    const low: RetrospectiveInsights = {
      ...insights,
      calibration: {
        overall: { scope: "overall", estimatedMinutes: 30, actualMinutes: 30, ratio: 1, sampleSize: 2, confidence: "low" },
        byCategory: []
      }
    };
    expect(buildAssistantSystemPrompt({ ...base, retro: low })).toContain("low confidence");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/ai/assistant/systemPrompt.test.ts`
Expected: FAIL — no "History & patterns" section exists.

- [ ] **Step 3: Update `systemPrompt.ts`**

Add the import at the top:

```typescript
import { actionPromptSpecs } from "./actions";
import type { AssistantContext, ContextTask } from "./types";
import type {
  CalibrationStat,
  EstimationCalibration,
  RetrospectiveInsights,
  SlipAnalysis,
  WeeklyReview
} from "../../retrospect/types";
```

Add these render helpers above `buildAssistantSystemPrompt`:

```typescript
function describeCalibrationStat(stat: CalibrationStat): string {
  const pct = Math.round(stat.ratio * 100);
  const flag = stat.confidence === "low" ? " (low confidence)" : "";
  return `${stat.scope}: actual is ${pct}% of estimate (ratio ${stat.ratio.toFixed(2)}, ${stat.sampleSize} tasks)${flag}`;
}

function renderCalibration(calibration: EstimationCalibration): string[] {
  if (!calibration.overall) return [];
  const lines = [`Estimation calibration — ${describeCalibrationStat(calibration.overall)}`];
  for (const stat of calibration.byCategory) {
    lines.push(`  • ${describeCalibrationStat(stat)}`);
  }
  return lines;
}

function renderSlips(slips: SlipAnalysis): string[] {
  if (slips.items.length === 0 && slips.blockerThemes.length === 0) return [];
  const lines = ["Slips (stuck or abandoned work):"];
  for (const item of slips.items) {
    lines.push(`  • "${item.title}" — ${item.kind}, ${item.ageDays}d old [${item.taskId}]`);
  }
  if (slips.moreCount > 0) lines.push(`  • …and ${slips.moreCount} more`);
  if (slips.blockerThemes.length > 0) {
    lines.push(`Recurring blockers: ${slips.blockerThemes.map((t) => `${t.keyword} (${t.count})`).join(", ")}`);
  }
  return lines;
}

function renderWeekly(weekly: WeeklyReview): string[] {
  const lines = [
    `This week vs last week: ${weekly.thisWeekMinutes}m vs ${weekly.lastWeekMinutes}m (${weekly.deltaMinutes >= 0 ? "+" : ""}${weekly.deltaMinutes}m), completed ${weekly.completedCount}, dropped ${weekly.droppedCount}`
  ];
  for (const delta of weekly.categoryDeltas) {
    lines.push(`  • ${delta.category}: ${delta.thisWeekMinutes}m (${delta.deltaMinutes >= 0 ? "+" : ""}${delta.deltaMinutes}m)`);
  }
  return lines;
}

function renderRetro(retro: RetrospectiveInsights): string {
  return [
    `History & patterns (last ${retro.windowDays} days — pre-computed, do not recalculate):`,
    ...renderCalibration(retro.calibration),
    ...renderSlips(retro.slips),
    ...renderWeekly(retro.weekly)
  ].join("\n");
}

const RETRO_RULES = [
  "Using history & patterns:",
  "- When the user asks how a day/week went or why things slip, ground your answer in the numbers above — cite them plainly.",
  "- When proposing or adjusting time estimates, apply the relevant category calibration ratio (or the overall ratio) so the plan reflects how long work actually takes.",
  "- If a figure is marked low confidence, hedge — say there isn't much history yet rather than over-claiming.",
  "- Never invent numbers that are not shown above."
].join("\n");
```

Then replace `buildAssistantSystemPrompt` with a version that appends the retro section when present:

```typescript
export function buildAssistantSystemPrompt(ctx: AssistantContext): string {
  const lines = [
    'You are the Yolo Assistant, a focused day-planning companion inside Yolo, a desktop app whose motto is "make your time count".',
    "You help the user plan and adjust their day. You never invent tasks the user did not ask for, and you reference existing tasks by the id shown in brackets.",
    "",
    "You respond with a SINGLE JSON object and nothing else — no prose outside it, no markdown code fences. The shape is:",
    '{ "reply": "<short conversational message in Markdown>", "actions": [ { "type": "<action>", ...params } ] }',
    "",
    "Rules for actions:",
    "- Only propose an action when the user clearly wants a change. For questions or advice, return an empty actions array.",
    "- Every action you propose will be shown to the user for explicit approval before anything happens — so propose freely but accurately.",
    "- Use the exact task ids from the context below. Never guess an id.",
    "- Keep `reply` brief and warm, like a coach who respects the user's time. Summarize what you are proposing; do not restate every field.",
    "",
    "Available actions:",
    renderActionCatalog(),
    "",
    "Current context:",
    renderContext(ctx)
  ];

  if (ctx.retro) {
    lines.push("", renderRetro(ctx.retro), "", RETRO_RULES);
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/ai/assistant/systemPrompt.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/systemPrompt.ts src/services/ai/assistant/systemPrompt.test.ts
git commit -m "feat: render retrospective facts and rules in assistant prompt"
```

---

## Task 8: Thread insights through the runner

**Files:**
- Modify: `src/services/ai/assistant/assistantRunner.ts`
- Test: `src/services/ai/assistant/assistantRunner.test.ts`

- [ ] **Step 1: Add a failing test asserting insights reach the prompt**

Append this test to `src/services/ai/assistant/assistantRunner.test.ts` (keep existing tests):

```typescript
import type { RetrospectiveInsights } from "../../retrospect/types";

const insightsFixture: RetrospectiveInsights = {
  windowDays: 30,
  hasData: true,
  calibration: {
    overall: { scope: "overall", estimatedMinutes: 60, actualMinutes: 90, ratio: 1.5, sampleSize: 6, confidence: "ok" },
    byCategory: []
  },
  slips: { items: [], moreCount: 0, blockerThemes: [] },
  weekly: {
    thisWeekMinutes: 0,
    lastWeekMinutes: 0,
    deltaMinutes: 0,
    categoryDeltas: [],
    completedCount: 0,
    droppedCount: 0
  }
};

it("passes retrospective insights into the system prompt", async () => {
  let capturedSystem = "";
  const generateChat = vi.fn(async (_settings, input) => {
    capturedSystem = input.system;
    return JSON.stringify({ reply: "ok", actions: [] });
  });

  await runAssistantTurn(
    {
      settings: {} as never,
      snapshot: { selectedDate: "2026-06-19", tasks: [], backlogTasks: [], categories: [] },
      messages: [{ role: "user", content: "how was my week?" }],
      insights: insightsFixture
    },
    { generateChat }
  );

  expect(capturedSystem).toContain("History & patterns");
});
```

If the existing test file does not already import `vi`/`it`, ensure this line is present at the top: `import { describe, expect, it, vi } from "vitest";`

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/ai/assistant/assistantRunner.test.ts`
Expected: FAIL — `insights` is not a valid property on the input / not forwarded.

- [ ] **Step 3: Update the runner**

In `src/services/ai/assistant/assistantRunner.ts`, add the import:

```typescript
import type { RetrospectiveInsights } from "../../retrospect/types";
```

Extend the input type with the optional field:

```typescript
export type RunAssistantTurnInput = {
  settings: AiSettings;
  snapshot: AssistantStoreSnapshot;
  messages: ChatTurn[]; // full conversation history, oldest first, last = newest user turn
  insights?: RetrospectiveInsights | null; // pre-computed retrospective facts
};
```

Pass it into the context builder:

```typescript
  const ctx = buildAssistantContext(input.snapshot, input.insights);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/ai/assistant/assistantRunner.test.ts`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/assistantRunner.ts src/services/ai/assistant/assistantRunner.test.ts
git commit -m "feat: forward retrospective insights through the assistant runner"
```

---

## Task 9: Load & cache insights in the assistant store

**Files:**
- Modify: `src/stores/assistantStore.ts`
- Test: `src/stores/assistantStore.test.ts`

- [ ] **Step 1: Add a failing test for lazy load + caching**

Add to `src/stores/assistantStore.test.ts`. Mock the analytics module and the runner so no DB/network is touched:

```typescript
import { buildRetrospectiveInsights } from "../services/retrospect";
import { runAssistantTurn } from "../services/ai/assistant/assistantRunner";

vi.mock("../services/retrospect", () => ({
  buildRetrospectiveInsights: vi.fn(async () => ({
    windowDays: 30,
    hasData: true,
    calibration: { overall: null, byCategory: [] },
    slips: { items: [], moreCount: 0, blockerThemes: [] },
    weekly: {
      thisWeekMinutes: 0,
      lastWeekMinutes: 0,
      deltaMinutes: 0,
      categoryDeltas: [],
      completedCount: 0,
      droppedCount: 0
    }
  }))
}));

vi.mock("../services/ai/assistant/assistantRunner", () => ({
  runAssistantTurn: vi.fn(async () => ({ reply: "hi", actions: [] }))
}));

it("loads insights once and forwards them to the runner", async () => {
  useAssistantStore.setState({ messages: [], status: "idle", error: null, insights: null });

  await useAssistantStore.getState().send("plan my day");
  await useAssistantStore.getState().send("and tomorrow?");

  expect(buildRetrospectiveInsights).toHaveBeenCalledTimes(1); // cached after first load
  const lastCall = (runAssistantTurn as unknown as vi.Mock).mock.calls.at(-1)?.[0];
  expect(lastCall.insights).not.toBeNull();
});
```

Note: this test assumes the existing suite already arranges a usable `settings`/`taskStore` (the current `send` tests do). Place the new test inside the existing `describe` block so shared setup applies. If the existing suite does not mock `runAssistantTurn`, move the `vi.mock` calls to the top of the file alongside other mocks.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/stores/assistantStore.test.ts`
Expected: FAIL — `insights` is not part of the store state; not loaded.

- [ ] **Step 3: Update the store**

In `src/stores/assistantStore.ts`, add imports:

```typescript
import { buildRetrospectiveInsights } from "../services/retrospect";
import type { RetrospectiveInsights } from "../services/retrospect/types";
```

Extend the state type with the new field and actions:

```typescript
type AssistantState = {
  messages: ChatMessage[];
  status: AssistantStatus;
  error: string | null;
  insights: RetrospectiveInsights | null;
  send: (text: string) => Promise<void>;
  applyAction: (messageId: string, actionId: string) => Promise<void>;
  dismissAction: (messageId: string, actionId: string) => void;
  loadInsights: () => Promise<void>;
  refreshInsights: () => Promise<void>;
  clear: () => void;
};
```

Add `insights: null` to the initial state (next to `error: null`). Add the two loaders inside the store object:

```typescript
  loadInsights: async () => {
    if (get().insights) return; // cached for the session
    try {
      const insights = await buildRetrospectiveInsights();
      set({ insights });
    } catch {
      // Analytics are best-effort; the assistant still works without them.
      set({ insights: null });
    }
  },

  refreshInsights: async () => {
    try {
      set({ insights: await buildRetrospectiveInsights() });
    } catch {
      set({ insights: null });
    }
  },
```

In `send`, ensure insights are loaded before the turn and pass them to the runner. After the `set({ messages: history, status: "thinking", error: null });` line, add:

```typescript
    await get().loadInsights();
```

Then update the `runAssistantTurn` call to forward them:

```typescript
      const result = await runAssistantTurn({
        settings: useSettingsStore.getState().settings,
        snapshot: snapshot(),
        messages: toChatTurns(history),
        insights: get().insights
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/stores/assistantStore.test.ts`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/stores/assistantStore.ts src/stores/assistantStore.test.ts
git commit -m "feat: load and cache retrospective insights in assistant store"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `yarn test`
Expected: PASS — all retrospect, assistant, and store tests green.

- [ ] **Step 2: Type-check + production build**

Run: `yarn build`
Expected: tsc + vite complete with no errors.

- [ ] **Step 3: Commit any incidental fixes**

```bash
git add -A
git commit -m "chore: verify retrospective intelligence build"
```

(Skip if the working tree is clean.)

---

## Self-Review

**Spec coverage**
- Estimation calibration → Task 2. ✔
- Slip & blocker analysis (lingering/overdue/long-dropped + blocker themes) → Task 3. ✔
- Weekly review narrative (week deltas, category movers, completed/dropped) → Task 4. ✔
- Deterministic compute, LLM narrates (no math on raw rows) → compute in Tasks 2-5; prompt rules in Task 7. ✔
- Reuse existing data sources (`getEntriesForRange`, `taskRepository.getAll`) → Task 5. ✔
- Surface inside the chat assistant (contextBuilder + systemPrompt) → Tasks 6-7. ✔
- Lazy load once per session, cached, graceful failure → Task 9. ✔
- Honesty/low-confidence handling → calibration confidence (Task 2), prompt rules + test (Task 7). ✔
- Empty state: `retro` omitted when no data → contextBuilder guard (Task 6) + orchestrator `hasData` (Task 5). ✔
- Additive only, no behavior change without history → every modified file keeps its existing path; retro is purely additive. ✔
- Deferred (focus-rhythm, dedicated view, proactive cards, profile, charts, goals) → not in any task. ✔

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step is complete.

**Type consistency:** `RetrospectiveInsights`, `CalibrationStat`, `SlipAnalysis`, `SlipItem`, `BlockerTheme`, `WeeklyReview`, `CategoryDelta`, `EstimationCalibration` are defined once in Task 1 and used with matching names/shapes in Tasks 2-9. `buildRetrospectiveInsights`, `loadRetrospectiveData`, `computeEstimationCalibration`, `computeSlipAnalysis`, `computeWeeklyReview`, `buildAssistantContext(snapshot, insights?)`, and `runAssistantTurn({..., insights})` signatures are consistent across tasks.
