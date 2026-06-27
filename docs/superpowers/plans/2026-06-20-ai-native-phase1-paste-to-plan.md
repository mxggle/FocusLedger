# AI-Native Phase 1 — Paste → Smart Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the in-app assistant from a single-shot JSON call into a tool-using agent loop that turns a pasted brain-dump into a deduplicated, auto-categorized, history-calibrated plan of editable confirm-cards.

**Architecture:** A provider-agnostic structured loop. The model returns either a `lookups` array (read-only tool requests) or a final `{reply, actions}`. The runner executes lookups against deterministic TS tools (`search_tasks`, `get_calibration`) over the in-memory task list and pre-computed retrospect insights, appends results, and re-calls — bounded to 4 steps. `create_task` gains ensure-or-create category support so the model can propose new projects. Propose-then-confirm and "numbers in TS, narrated by LLM" invariants are preserved.

**Tech Stack:** TypeScript, React 18, Zustand, Vitest. No new dependencies. Verify with `yarn build` and `yarn test`.

**Spec:** `docs/superpowers/specs/2026-06-20-ai-native-phase1-paste-to-plan-design.md`

---

## File Structure

**New files**
- `src/services/ai/assistant/tools.ts` — read-tool registry (`search_tasks`, `get_calibration`), `executeLookup`, `toolCatalog`, plus `LookupRequest` / `ToolDeps` types.
- `src/services/ai/assistant/tools.test.ts`
- `src/services/ai/assistant/agentLoop.ts` — bounded lookup→recall→finalize loop; emits step labels; injected `generateChat`.
- `src/services/ai/assistant/agentLoop.test.ts`

**Modified files**
- `src/services/ai/assistant/responseParser.ts` — add `parseLoopStep` (lookups vs final).
- `src/services/ai/assistant/types.ts` — `allTasksCount?` on `AssistantContext`; `ensureCategory` on `AssistantTaskStore`; `CreateTaskParams`.
- `src/services/ai/assistant/contextBuilder.ts` — accept `allTasks` in the snapshot; expose `allTasksCount`.
- `src/services/ai/assistant/actions.ts` — `create_task` ensure-or-create category.
- `src/services/ai/assistant/systemPrompt.ts` — tool catalog + lookup protocol + ingestion rules.
- `src/services/ai/assistant/assistantRunner.ts` — delegate to `runAgentLoop`; thread `onStep`.
- `src/stores/taskStore.ts` — add `ensureCategory`.
- `src/stores/assistantStore.ts` — `steps` state, `onStep` wiring, `applyAll`, pass `allTasks`.
- `src/components/assistant/MessageList.tsx` + `AssistantPanel.tsx` — step trace, grouped plan, Approve all.
- `src/components/assistant/Composer.tsx` — "Plan this" affordance.

---

## Task 1: Read-tool registry (`tools.ts`)

Deterministic tools the agent can call. Pure functions over injected deps — no DB, no LLM math.

**Files:**
- Create: `src/services/ai/assistant/tools.ts`
- Test: `src/services/ai/assistant/tools.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/assistant/tools.test.ts
import { describe, expect, it } from "vitest";
import { executeLookup, toolCatalog, type ToolDeps } from "./tools";
import type { Task } from "../../../types";
import type { RetrospectiveInsights } from "../../retrospect/types";

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    id: partial.id,
    title: partial.title,
    description: partial.description ?? null,
    category_id: partial.category_id ?? null,
    status: partial.status ?? "todo",
    priority: partial.priority ?? "medium",
    estimated_minutes: partial.estimated_minutes ?? null,
    due_date: partial.due_date ?? null,
    template_id: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    completed_at: null,
    dropped_at: null
  };
}

const insights: RetrospectiveInsights = {
  windowDays: 30,
  hasData: true,
  calibration: {
    overall: { scope: "overall", estimatedMinutes: 100, actualMinutes: 130, ratio: 1.3, sampleSize: 8, confidence: "ok" },
    byCategory: [
      { scope: "Design", estimatedMinutes: 60, actualMinutes: 120, ratio: 2.0, sampleSize: 4, confidence: "ok" }
    ]
  },
  slips: { items: [], moreCount: 0, blockerThemes: [] },
  weekly: { thisWeekMinutes: 0, lastWeekMinutes: 0, deltaMinutes: 0, categoryDeltas: [], completedCount: 0, droppedCount: 0 }
};

const deps: ToolDeps = {
  allTasks: [
    task({ id: "t1", title: "Write quarterly report", description: "finance summary" }),
    task({ id: "t2", title: "Book dentist", status: "done" })
  ],
  insights
};

describe("executeLookup", () => {
  it("search_tasks returns id-bearing matches on a keyword", () => {
    const out = executeLookup({ tool: "search_tasks", query: "report" }, deps);
    expect(out).toContain("t1");
    expect(out).toContain("Write quarterly report");
    expect(out).not.toContain("t2");
  });

  it("search_tasks reports no matches without throwing", () => {
    const out = executeLookup({ tool: "search_tasks", query: "zzzznotfound" }, deps);
    expect(out.toLowerCase()).toContain("no matching");
  });

  it("get_calibration returns the per-category ratio without recomputing", () => {
    const out = executeLookup({ tool: "get_calibration", category: "Design" }, deps);
    expect(out).toContain("2");
    expect(out).toContain("Design");
  });

  it("get_calibration falls back to overall when category is unknown", () => {
    const out = executeLookup({ tool: "get_calibration", category: "Nonexistent" }, deps);
    expect(out).toContain("overall");
  });

  it("returns an error string for an unknown tool instead of throwing", () => {
    const out = executeLookup({ tool: "explode_sun" } as never, deps);
    expect(out.toLowerCase()).toContain("unknown tool");
  });

  it("toolCatalog lists every tool name", () => {
    const cat = toolCatalog();
    expect(cat).toContain("search_tasks");
    expect(cat).toContain("get_calibration");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/services/ai/assistant/tools.test.ts`
Expected: FAIL — `Cannot find module './tools'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/ai/assistant/tools.ts
import type { Task } from "../../../types";
import type { RetrospectiveInsights, CalibrationStat } from "../../retrospect/types";

/** A read-only request the model emits during the agent loop. */
export type LookupRequest = {
  tool: string;
  query?: string;
  category?: string;
  date?: string;
};

/** Everything the deterministic tools may read. Injected so tools stay pure. */
export type ToolDeps = {
  allTasks: Task[];
  insights: RetrospectiveInsights | null;
};

type AssistantTool = {
  name: string;
  when: string;
  params: string;
  execute: (req: LookupRequest, deps: ToolDeps) => string;
};

const MAX_SEARCH_RESULTS = 8;

function searchTasks(req: LookupRequest, deps: ToolDeps): string {
  const query = (req.query ?? "").trim().toLowerCase();
  if (query.length === 0) return "search_tasks: provide a non-empty query.";
  const terms = query.split(/\s+/);
  const scored = deps.allTasks
    .map((t) => {
      const hay = `${t.title} ${t.description ?? ""}`.toLowerCase();
      const score = terms.reduce((acc, term) => (hay.includes(term) ? acc + 1 : acc), 0);
      return { t, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SEARCH_RESULTS);

  if (scored.length === 0) return `search_tasks("${req.query}"): no matching tasks.`;
  const lines = scored.map(
    ({ t }) => `- [${t.id}] "${t.title}" (${t.status}${t.due_date ? `, due ${t.due_date}` : ""})`
  );
  return [`search_tasks("${req.query}") found ${scored.length}:`, ...lines].join("\n");
}

function describeStat(stat: CalibrationStat): string {
  const pct = Math.round(stat.ratio * 100);
  const flag = stat.confidence === "low" ? " (low confidence — little history)" : "";
  return `${stat.scope}: actual is ${pct}% of estimate (ratio ${stat.ratio.toFixed(2)}, ${stat.sampleSize} tasks)${flag}`;
}

function getCalibration(req: LookupRequest, deps: ToolDeps): string {
  const calibration = deps.insights?.calibration;
  if (!calibration?.overall) return "get_calibration: no estimate history yet — use your own judgement.";
  const wanted = (req.category ?? "").trim().toLowerCase();
  if (wanted.length > 0) {
    const match = calibration.byCategory.find((s) => s.scope.toLowerCase() === wanted);
    if (match) return `get_calibration — ${describeStat(match)}`;
  }
  return `get_calibration — ${describeStat(calibration.overall)} (overall; no specific category match)`;
}

const TOOL_REGISTRY: Record<string, AssistantTool> = {
  search_tasks: {
    name: "search_tasks",
    when: "you need to check whether a task already exists (dedup) before creating one",
    params: 'query (required, keywords)',
    execute: searchTasks
  },
  get_calibration: {
    name: "get_calibration",
    when: "you are about to set estimated_minutes and want to size it from real history",
    params: "category (optional, a category name; omit for the overall ratio)",
    execute: getCalibration
  }
};

/** Run one lookup. Never throws — returns an error string the model can read. */
export function executeLookup(req: LookupRequest, deps: ToolDeps): string {
  const tool = TOOL_REGISTRY[req.tool];
  if (!tool) return `Unknown tool "${req.tool}". Available: ${Object.keys(TOOL_REGISTRY).join(", ")}.`;
  try {
    return tool.execute(req, deps);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `Tool "${req.tool}" failed: ${detail}`;
  }
}

/** Prompt fragment describing the read tools. */
export function toolCatalog(): string {
  return Object.values(TOOL_REGISTRY)
    .map((tool) => `- ${tool.name}: use when ${tool.when}. params: ${tool.params}`)
    .join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/services/ai/assistant/tools.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/tools.ts src/services/ai/assistant/tools.test.ts
git commit -m "feat: deterministic read tools for the assistant agent loop"
```

---

## Task 2: Loop-step parser (`parseLoopStep`)

Distinguish a lookup request from a final answer.

**Files:**
- Modify: `src/services/ai/assistant/responseParser.ts`
- Test: `src/services/ai/assistant/responseParser.test.ts`

- [ ] **Step 1: Write the failing test (append to the existing describe block file)**

```typescript
// append to src/services/ai/assistant/responseParser.test.ts
import { parseLoopStep } from "./responseParser";

describe("parseLoopStep", () => {
  it("classifies a non-empty lookups array as a lookups step", () => {
    const raw = JSON.stringify({ lookups: [{ tool: "search_tasks", query: "report" }] });
    const step = parseLoopStep(raw);
    expect(step.kind).toBe("lookups");
    if (step.kind === "lookups") {
      expect(step.lookups).toHaveLength(1);
      expect(step.lookups[0].tool).toBe("search_tasks");
    }
  });

  it("treats a reply/actions object as final", () => {
    const raw = JSON.stringify({ reply: "done", actions: [] });
    expect(parseLoopStep(raw).kind).toBe("final");
  });

  it("treats an empty lookups array as final (nothing to look up)", () => {
    const raw = JSON.stringify({ lookups: [], reply: "hi" });
    expect(parseLoopStep(raw).kind).toBe("final");
  });

  it("treats unparseable text as final", () => {
    expect(parseLoopStep("plain text").kind).toBe("final");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/services/ai/assistant/responseParser.test.ts`
Expected: FAIL — `parseLoopStep` is not exported.

- [ ] **Step 3: Add the implementation to `responseParser.ts`**

Add these exports below the existing `parseAssistantResponse` (reuse the file's existing `extractJsonObject` helper):

```typescript
// src/services/ai/assistant/responseParser.ts  (add)
import type { LookupRequest } from "./tools";

export type LoopStep =
  | { kind: "lookups"; lookups: LookupRequest[] }
  | { kind: "final"; raw: string };

/** Decide whether a model turn is a read-tool request or the final answer.
 *  A turn is "lookups" only when it parses to an object with a non-empty
 *  `lookups` array; everything else is final and handed to parseAssistantResponse. */
export function parseLoopStep(raw: string): LoopStep {
  const candidate = extractJsonObject(raw);
  if (candidate) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const lookups = parsed.lookups;
      if (Array.isArray(lookups) && lookups.length > 0) {
        const cleaned = lookups
          .filter((l): l is Record<string, unknown> => typeof l === "object" && l !== null && typeof (l as Record<string, unknown>).tool === "string")
          .map((l) => ({
            tool: String(l.tool),
            query: typeof l.query === "string" ? l.query : undefined,
            category: typeof l.category === "string" ? l.category : undefined,
            date: typeof l.date === "string" ? l.date : undefined
          }));
        if (cleaned.length > 0) return { kind: "lookups", lookups: cleaned };
      }
    } catch {
      // fall through to final
    }
  }
  return { kind: "final", raw };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/services/ai/assistant/responseParser.test.ts`
Expected: PASS (existing 5 + new 4).

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/responseParser.ts src/services/ai/assistant/responseParser.test.ts
git commit -m "feat: parseLoopStep to split lookup requests from final answers"
```

---

## Task 3: Carry `allTasks` into the context

The tools need the full task list. Thread it through the snapshot and expose a count to the prompt.

**Files:**
- Modify: `src/services/ai/assistant/types.ts`, `src/services/ai/assistant/contextBuilder.ts`
- Test: `src/services/ai/assistant/contextBuilder.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```typescript
// append to src/services/ai/assistant/contextBuilder.test.ts
import { describe, expect, it } from "vitest";
import { buildAssistantContext } from "./contextBuilder";

describe("buildAssistantContext allTasks", () => {
  it("exposes allTasksCount from the snapshot", () => {
    const ctx = buildAssistantContext({
      selectedDate: "2026-06-20",
      tasks: [],
      backlogTasks: [],
      categories: [],
      allTasks: [
        // two minimal tasks
        { id: "a", title: "x" } as never,
        { id: "b", title: "y" } as never
      ]
    });
    expect(ctx.allTasksCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/services/ai/assistant/contextBuilder.test.ts`
Expected: FAIL — `allTasks` is not a valid snapshot field / `allTasksCount` undefined.

- [ ] **Step 3: Implement**

In `src/services/ai/assistant/types.ts`, add to `AssistantContext` (optional so existing fixtures stay valid):

```typescript
export type AssistantContext = {
  today: string;
  categories: { id: string; name: string }[];
  tasks: ContextTask[];
  backlog: ContextTask[];
  allTasksCount?: number; // total tasks searchable via search_tasks
  retro?: RetrospectiveInsights;
};
```

In `src/services/ai/assistant/contextBuilder.ts`, add `allTasks` to the snapshot type and set the count:

```typescript
export type AssistantStoreSnapshot = {
  selectedDate: string;
  tasks: Task[];
  backlogTasks: Task[];
  categories: Category[];
  allTasks: Task[];
};

export function buildAssistantContext(
  snapshot: AssistantStoreSnapshot,
  insights?: RetrospectiveInsights | null
): AssistantContext {
  return {
    today: snapshot.selectedDate,
    categories: snapshot.categories.map((category) => ({ id: category.id, name: category.name })),
    tasks: snapshot.tasks.map(toContextTask),
    backlog: snapshot.backlogTasks.slice(0, BACKLOG_CAP).map(toContextTask),
    allTasksCount: snapshot.allTasks.length,
    ...(insights && insights.hasData ? { retro: insights } : {})
  };
}
```

- [ ] **Step 4: Fix the existing contextBuilder test fixture**

Any existing `buildAssistantContext({...})` call in `contextBuilder.test.ts` now needs `allTasks: []`. Add `allTasks: []` to each existing snapshot literal in that file.

- [ ] **Step 5: Run to verify it passes**

Run: `yarn test src/services/ai/assistant/contextBuilder.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/assistant/types.ts src/services/ai/assistant/contextBuilder.ts src/services/ai/assistant/contextBuilder.test.ts
git commit -m "feat: carry full task list + allTasksCount into assistant context"
```

---

## Task 4: `create_task` ensure-or-create category

Let the model propose a new project; resolve-or-create the category on apply.

**Files:**
- Modify: `src/services/ai/assistant/types.ts`, `src/services/ai/assistant/actions.ts`
- Test: `src/services/ai/assistant/actions.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```typescript
// append to src/services/ai/assistant/actions.test.ts
import { describe, expect, it, vi } from "vitest";
import { ACTION_REGISTRY, validateAction } from "./actions";
import type { AssistantContext } from "./types";

const ctxNew: AssistantContext = {
  today: "2026-06-20",
  categories: [{ id: "c1", name: "Work" }],
  tasks: [],
  backlog: []
};

describe("create_task category handling", () => {
  it("resolves an existing category by name to its id, no new_category_name", () => {
    const action = validateAction({ type: "create_task", title: "A", category: "Work" }, ctxNew);
    expect(action).not.toBeNull();
    const params = action!.params as Record<string, unknown>;
    expect(params.category_id).toBe("c1");
    expect(params.new_category_name).toBeNull();
  });

  it("records an unknown category as new_category_name and labels it new", () => {
    const action = validateAction({ type: "create_task", title: "A", category: "Apartment Move" }, ctxNew);
    const params = action!.params as Record<string, unknown>;
    expect(params.category_id).toBeNull();
    expect(params.new_category_name).toBe("Apartment Move");
    expect(action!.summary.toLowerCase()).toContain("new project");
  });

  it("execute ensures the new category then creates the task", async () => {
    const store = {
      ensureCategory: vi.fn().mockResolvedValue("c-new"),
      createTask: vi.fn().mockResolvedValue({ ok: true })
    };
    const action = validateAction({ type: "create_task", title: "A", category: "Apartment Move" }, ctxNew)!;
    await ACTION_REGISTRY.create_task.execute(action.params, store as never);
    expect(store.ensureCategory).toHaveBeenCalledWith("Apartment Move");
    const createArg = store.createTask.mock.calls[0][0];
    expect(createArg.category_id).toBe("c-new");
    expect(createArg.new_category_name).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/services/ai/assistant/actions.test.ts`
Expected: FAIL — `new_category_name` undefined / `ensureCategory` not on store type.

- [ ] **Step 3: Implement**

In `src/services/ai/assistant/types.ts`, add `ensureCategory` to the store interface:

```typescript
export interface AssistantTaskStore {
  createTask(input: CreateTaskInput): Promise<ActionResult>;
  rescheduleTask(taskId: string, dueDate: string): Promise<ActionResult>;
  moveTaskToBacklog(taskId: string): Promise<ActionResult>;
  dropTask(taskId: string): Promise<ActionResult>;
  completeTask(taskId: string, note?: string): Promise<ActionResult>;
  startTask(taskId: string): Promise<"started" | "failed">;
  ensureCategory(name: string): Promise<string>; // returns category id, creating if absent
}
```

In `src/services/ai/assistant/actions.ts`, change the create-task descriptor. Replace the `CreateParams` type and `createTask` descriptor with:

```typescript
type CreateParams = CreateTaskInput & { new_category_name: string | null };

/** Resolve `category` to an existing id, or mark it as a new category to create. */
function resolveCategoryOrNew(
  raw: Record<string, unknown>,
  ctx: AssistantContext
): { category_id: string | null; new_category_name: string | null } {
  const value = raw.category;
  if (typeof value !== "string" || value.trim().length === 0) {
    return { category_id: null, new_category_name: null };
  }
  const needle = value.trim().toLowerCase();
  const match = ctx.categories.find(
    (category) => category.id.toLowerCase() === needle || category.name.toLowerCase() === needle
  );
  if (match) return { category_id: match.id, new_category_name: null };
  return { category_id: null, new_category_name: value.trim() };
}

const createTask: ActionDescriptor<CreateParams> = {
  type: "create_task",
  destructive: false,
  promptSpec: {
    name: "create_task",
    when: "the user wants a new task added",
    params: 'title (required), description (optional), category (optional — an existing category name OR a new project name; a new name will be created on approval), priority ("low"|"medium"|"high", optional), estimated_minutes (number, optional), due_date ("today"|YYYY-MM-DD, optional — omit for backlog)'
  },
  validate: (raw, ctx) => {
    const priorityRaw = raw.priority;
    const priority =
      priorityRaw === "low" || priorityRaw === "medium" || priorityRaw === "high" ? priorityRaw : undefined;
    const estimate =
      typeof raw.estimated_minutes === "number" && raw.estimated_minutes > 0 ? raw.estimated_minutes : null;
    const { category_id, new_category_name } = resolveCategoryOrNew(raw, ctx);
    return {
      title: str(raw, "title"),
      description: optionalStr(raw, "description"),
      category_id,
      new_category_name,
      priority,
      estimated_minutes: estimate,
      due_date: resolveDueDate(raw, ctx)
    };
  },
  describe: (params) => {
    const where = params.due_date ? `for ${params.due_date}` : "in backlog";
    const project = params.new_category_name ? ` in new project "${params.new_category_name}"` : "";
    return `Create task "${params.title}" ${where}${project}`;
  },
  execute: async (params, store) => {
    let categoryId = params.category_id ?? null;
    if (params.new_category_name) {
      categoryId = await store.ensureCategory(params.new_category_name);
    }
    const { new_category_name, ...rest } = params;
    void new_category_name;
    return store.createTask({ ...rest, category_id: categoryId });
  }
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `yarn test src/services/ai/assistant/actions.test.ts`
Expected: PASS (existing + 3 new). If pre-existing tests construct a mock store, add `ensureCategory: vi.fn()` to those mocks.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/types.ts src/services/ai/assistant/actions.ts src/services/ai/assistant/actions.test.ts
git commit -m "feat: create_task can propose and ensure a new project category"
```

---

## Task 5: System prompt — tool catalog, lookup protocol, ingestion rules

**Files:**
- Modify: `src/services/ai/assistant/systemPrompt.ts`
- Test: `src/services/ai/assistant/systemPrompt.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```typescript
// append to src/services/ai/assistant/systemPrompt.test.ts
import { describe, expect, it } from "vitest";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import type { AssistantContext } from "./types";

const ctxTools: AssistantContext = {
  today: "2026-06-20",
  categories: [],
  tasks: [],
  backlog: [],
  allTasksCount: 12
};

describe("system prompt agent-loop sections", () => {
  it("documents the lookup protocol and read tools", () => {
    const prompt = buildAssistantSystemPrompt(ctxTools);
    expect(prompt).toContain("lookups");
    expect(prompt).toContain("search_tasks");
    expect(prompt).toContain("get_calibration");
  });

  it("instructs dedup before creating tasks", () => {
    const prompt = buildAssistantSystemPrompt(ctxTools);
    expect(prompt.toLowerCase()).toContain("duplicate");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/services/ai/assistant/systemPrompt.test.ts`
Expected: FAIL — prompt lacks "lookups"/"search_tasks".

- [ ] **Step 3: Implement**

In `src/services/ai/assistant/systemPrompt.ts`, import the catalog and insert a tools section. Add at top:

```typescript
import { toolCatalog } from "./tools";
```

Add this constant near `RETRO_RULES`:

```typescript
const TOOL_PROTOCOL = [
  "Gathering facts before you answer (optional, up to a few rounds):",
  "- Before proposing changes you may look things up. To do so, respond with ONLY a JSON object of the form:",
  '  { "lookups": [ { "tool": "search_tasks", "query": "..." } ] }',
  "- You will then receive the results as the next message and can look up more or give your final answer.",
  "- When you are ready, respond with the final { \"reply\", \"actions\" } object as usual. Do not mix lookups and a final answer in the same message.",
  "- Before creating any task, use search_tasks to check it does not already exist; if a close duplicate exists, do not recreate it — mention the existing task id in your reply instead.",
  "- Before setting estimated_minutes, you may use get_calibration to size the estimate from real history.",
  "",
  "Read tools available:",
  toolCatalog()
].join("\n");
```

In `buildAssistantSystemPrompt`, insert the protocol after the "Available actions" block and before "Current context:". Replace the array tail so it reads:

```typescript
    "Available actions:",
    renderActionCatalog(),
    "",
    TOOL_PROTOCOL,
    "",
    "Current context:",
    renderContext(ctx)
```

Also append one line inside `renderContext` (after the categories line) when searchable tasks exist:

```typescript
  if (ctx.allTasksCount && ctx.allTasksCount > 0) {
    lines.push(`You can search all ${ctx.allTasksCount} of the user's tasks with the search_tasks tool.`);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `yarn test src/services/ai/assistant/systemPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/systemPrompt.ts src/services/ai/assistant/systemPrompt.test.ts
git commit -m "feat: system prompt documents lookup protocol, tools, and dedup rules"
```

---

## Task 6: Agent loop (`agentLoop.ts`) + runner delegation

The bounded lookup→recall→finalize loop. Injected `generateChat` for tests; `onStep` for live status.

**Files:**
- Create: `src/services/ai/assistant/agentLoop.ts`
- Modify: `src/services/ai/assistant/assistantRunner.ts`
- Test: `src/services/ai/assistant/agentLoop.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/assistant/agentLoop.test.ts
import { describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "./agentLoop";
import type { AssistantStoreSnapshot } from "./contextBuilder";

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-20",
  tasks: [],
  backlogTasks: [],
  categories: [],
  allTasks: []
};

describe("runAgentLoop", () => {
  it("executes a lookup, feeds results back, then finalizes", async () => {
    const generateChat = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ lookups: [{ tool: "search_tasks", query: "report" }] }))
      .mockResolvedValueOnce(JSON.stringify({ reply: "All set.", actions: [] }));
    const steps: string[] = [];

    const result = await runAgentLoop(
      { settings: {} as never, snapshot, messages: [{ role: "user", content: "plan my notes" }], onStep: (s) => steps.push(s) },
      { generateChat }
    );

    expect(generateChat).toHaveBeenCalledTimes(2);
    // second call must include the tool results as an appended turn
    const secondMessages = generateChat.mock.calls[1][1].messages;
    expect(JSON.stringify(secondMessages)).toContain("search_tasks");
    expect(result.reply).toBe("All set.");
    expect(steps.length).toBeGreaterThan(0);
  });

  it("finalizes immediately when the first response is final", async () => {
    const generateChat = vi.fn().mockResolvedValue(JSON.stringify({ reply: "hi", actions: [] }));
    const result = await runAgentLoop(
      { settings: {} as never, snapshot, messages: [{ role: "user", content: "hi" }] },
      { generateChat }
    );
    expect(generateChat).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe("hi");
  });

  it("stops after MAX_STEPS and finalizes the last response", async () => {
    const generateChat = vi.fn().mockResolvedValue(JSON.stringify({ lookups: [{ tool: "search_tasks", query: "x" }] }));
    const result = await runAgentLoop(
      { settings: {} as never, snapshot, messages: [{ role: "user", content: "loop" }] },
      { generateChat }
    );
    // bounded: should not call forever
    expect(generateChat.mock.calls.length).toBeLessThanOrEqual(4);
    expect(result).toHaveProperty("reply");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/services/ai/assistant/agentLoop.test.ts`
Expected: FAIL — `Cannot find module './agentLoop'`.

- [ ] **Step 3: Implement the loop**

```typescript
// src/services/ai/assistant/agentLoop.ts
import { generateChat as defaultGenerateChat } from "../chatClient";
import type { AiSettings, ChatInput, ChatTurn } from "../providers";
import { buildAssistantContext, type AssistantStoreSnapshot } from "./contextBuilder";
import { parseAssistantResponse, parseLoopStep } from "./responseParser";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import { executeLookup, type ToolDeps } from "./tools";
import type { AssistantTurnResult } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";

const ASSISTANT_TEMPERATURE = 0.3;
const MAX_STEPS = 4;

const STEP_LABELS: Record<string, string> = {
  search_tasks: "Scanning your existing tasks…",
  get_calibration: "Checking how long similar work takes…"
};

export type RunAgentLoopInput = {
  settings: AiSettings;
  snapshot: AssistantStoreSnapshot;
  messages: ChatTurn[];
  insights?: RetrospectiveInsights | null;
  onStep?: (label: string) => void;
};

export type AgentLoopDeps = {
  generateChat: (settings: AiSettings, input: ChatInput) => Promise<string>;
};

export async function runAgentLoop(
  input: RunAgentLoopInput,
  deps: AgentLoopDeps = { generateChat: defaultGenerateChat }
): Promise<AssistantTurnResult> {
  const ctx = buildAssistantContext(input.snapshot, input.insights);
  const system = buildAssistantSystemPrompt(ctx);
  const toolDeps: ToolDeps = { allTasks: input.snapshot.allTasks, insights: input.insights ?? null };

  const messages: ChatTurn[] = [...input.messages];
  let lastRaw = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const raw = await deps.generateChat(input.settings, {
      system,
      messages,
      temperature: ASSISTANT_TEMPERATURE
    });
    lastRaw = raw;

    const parsed = parseLoopStep(raw);
    if (parsed.kind === "final") {
      return parseAssistantResponse(raw, ctx);
    }

    // lookups step: announce, execute, append results, loop again
    for (const lookup of parsed.lookups) {
      input.onStep?.(STEP_LABELS[lookup.tool] ?? `Looking up ${lookup.tool}…`);
    }
    const results = parsed.lookups.map((lookup) => executeLookup(lookup, toolDeps)).join("\n\n");
    messages.push({ role: "assistant", content: raw });
    messages.push({ role: "user", content: `Tool results:\n${results}\n\nContinue, or give your final answer.` });
  }

  input.onStep?.("Drafting your plan…");
  // Exhausted the budget: ask for a final answer once more, then parse whatever we get.
  const finalRaw = await deps.generateChat(input.settings, {
    system,
    messages: [...messages, { role: "user", content: "Give your final answer now as the { reply, actions } object." }],
    temperature: ASSISTANT_TEMPERATURE
  }).catch(() => lastRaw);
  return parseAssistantResponse(finalRaw, ctx);
}
```

Note: `MAX_STEPS = 4` lookup rounds plus one forced finalize. The third test asserts `<= 4` *lookup* calls; the forced finalize is allowed beyond that, so adjust the assertion to `expect(generateChat.mock.calls.length).toBeLessThanOrEqual(MAX_STEPS + 1)` — update the test import to read `MAX_STEPS` is not exported, so keep the literal `5` in that assertion. Change the test line to `toBeLessThanOrEqual(5)`.

- [ ] **Step 4: Update the third test's bound**

In `agentLoop.test.ts`, change the cap assertion to:

```typescript
    expect(generateChat.mock.calls.length).toBeLessThanOrEqual(5);
```

- [ ] **Step 5: Delegate the runner to the loop**

Replace the body of `runAssistantTurn` in `src/services/ai/assistant/assistantRunner.ts` so it forwards to the loop and accepts `onStep`:

```typescript
// src/services/ai/assistant/assistantRunner.ts
import { runAgentLoop, type AgentLoopDeps } from "./agentLoop";
import type { AiSettings, ChatInput, ChatTurn } from "../providers";
import type { AssistantStoreSnapshot } from "./contextBuilder";
import type { AssistantTurnResult } from "./types";
import type { RetrospectiveInsights } from "../../retrospect/types";

export type RunAssistantTurnInput = {
  settings: AiSettings;
  snapshot: AssistantStoreSnapshot;
  messages: ChatTurn[];
  insights?: RetrospectiveInsights | null;
  onStep?: (label: string) => void;
};

export type AssistantRunnerDeps = AgentLoopDeps;

export async function runAssistantTurn(
  input: RunAssistantTurnInput,
  deps?: AssistantRunnerDeps
): Promise<AssistantTurnResult> {
  return runAgentLoop(input, deps);
}

export type { ChatInput };
```

- [ ] **Step 6: Reconcile the existing `assistantRunner.test.ts`**

The existing runner test injects `generateChat` returning a single final JSON — that still works through the loop unchanged. Run it to confirm. If it asserted the runner builds context itself, it remains valid because the loop builds context. Run: `yarn test src/services/ai/assistant/assistantRunner.test.ts` and fix any import of removed symbols (e.g. `ASSISTANT_TEMPERATURE` is now internal to `agentLoop.ts`; if referenced, delete that assertion).

- [ ] **Step 7: Run the loop + runner tests**

Run: `yarn test src/services/ai/assistant/agentLoop.test.ts src/services/ai/assistant/assistantRunner.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/services/ai/assistant/agentLoop.ts src/services/ai/assistant/agentLoop.test.ts src/services/ai/assistant/assistantRunner.ts src/services/ai/assistant/assistantRunner.test.ts
git commit -m "feat: bounded tool-using agent loop powering the assistant runner"
```

---

## Task 7: `taskStore.ensureCategory`

**Files:**
- Modify: `src/stores/taskStore.ts`
- Test: `src/stores/taskStore.test.ts` (create if absent; otherwise append)

- [ ] **Step 1: Write the failing test**

```typescript
// src/stores/taskStore.ensureCategory.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { useTaskStore } from "./taskStore";

// These tests assume the store can run against the test DB harness already used
// by other store tests. If the repo mocks the DB elsewhere, mirror that setup here.

describe("taskStore.ensureCategory", () => {
  beforeEach(async () => {
    await useTaskStore.getState().refresh();
  });

  it("returns the id of an existing category (case-insensitive) without creating", async () => {
    const before = useTaskStore.getState().categories.length;
    const existing = useTaskStore.getState().categories[0];
    if (!existing) return; // skip when no seed categories
    const id = await useTaskStore.getState().ensureCategory(existing.name.toUpperCase());
    expect(id).toBe(existing.id);
    expect(useTaskStore.getState().categories.length).toBe(before);
  });

  it("creates a category when the name is new and returns its id", async () => {
    const name = `Proj ${Date.now()}`;
    const id = await useTaskStore.getState().ensureCategory(name);
    expect(id).toBeTruthy();
    expect(useTaskStore.getState().categories.some((c) => c.id === id && c.name === name)).toBe(true);
  });
});
```

If the project has no DB harness for store tests, **skip this test file** and instead unit-test the resolution logic by extracting a pure helper (see Step 3 note). Prefer the pure-helper route if `taskStore.test.ts` does not already exist.

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/stores/taskStore.ensureCategory.test.ts`
Expected: FAIL — `ensureCategory` is not a function.

- [ ] **Step 3: Implement**

Add to the `TaskState` type and the store body in `src/stores/taskStore.ts`. Type:

```typescript
  ensureCategory: (name: string) => Promise<string>;
```

Implementation (place near `createCategory`):

```typescript
  ensureCategory: async (name) => {
    const trimmed = name.trim();
    const needle = trimmed.toLowerCase();
    const existing = get().categories.find((c) => c.name.trim().toLowerCase() === needle);
    if (existing) return existing.id;
    const result = await get().createCategory({ name: trimmed });
    if (!result.ok) throw new Error(result.message ?? "Could not create category");
    await get().refresh();
    const created = get().categories.find((c) => c.name.trim().toLowerCase() === needle);
    if (!created) throw new Error(`Category "${trimmed}" was not created`);
    return created.id;
  },
```

Note: confirm `createCategory` returns `{ ok: boolean; message?: string }` (`MutationResult`); adjust the success check to the actual shape if it differs (e.g. it may already refresh internally, in which case the explicit `refresh()` is still safe).

- [ ] **Step 4: Run to verify it passes**

Run: `yarn test src/stores/taskStore.ensureCategory.test.ts`
Expected: PASS (or skipped per Step 1 note).

- [ ] **Step 5: Commit**

```bash
git add src/stores/taskStore.ts src/stores/taskStore.ensureCategory.test.ts
git commit -m "feat: taskStore.ensureCategory resolves or creates a category by name"
```

---

## Task 8: assistantStore — `steps`, `onStep`, `applyAll`, `allTasks`

**Files:**
- Modify: `src/stores/assistantStore.ts`
- Test: `src/stores/assistantStore.applyAll.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/stores/assistantStore.applyAll.test.ts
import { describe, expect, it } from "vitest";

// Pure reducer extracted from the store for testability.
import { nextAfterApplyAll } from "./assistantStore";
import type { ChatMessage } from "../services/ai/assistant/types";

const message: ChatMessage = {
  id: "m1",
  role: "assistant",
  content: "plan",
  createdAt: "2026-06-20T00:00:00Z",
  actions: [
    { id: "a1", type: "create_task", params: {}, summary: "A", destructive: false, status: "pending" },
    { id: "a2", type: "create_task", params: {}, summary: "B", destructive: false, status: "applied" }
  ]
};

describe("applyAll selection", () => {
  it("returns only pending, non-destructive action ids for a message", () => {
    const ids = nextAfterApplyAll([message], "m1");
    expect(ids).toEqual(["a1"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/stores/assistantStore.applyAll.test.ts`
Expected: FAIL — `nextAfterApplyAll` is not exported.

- [ ] **Step 3: Implement store changes**

In `src/stores/assistantStore.ts`:

1. Add `steps: string[]` to `AssistantState` and initialize `steps: []`.
2. Add `applyAll: (messageId: string) => Promise<void>` to `AssistantState`.
3. Export the pure selector used by the test:

```typescript
/** Ids of actions in a message that are safe to bulk-apply (pending, non-destructive). */
export function nextAfterApplyAll(messages: ChatMessage[], messageId: string): string[] {
  const message = messages.find((m) => m.id === messageId);
  if (!message?.actions) return [];
  return message.actions.filter((a) => a.status === "pending" && !a.destructive).map((a) => a.id);
}
```

4. Update `snapshot()` to include `allTasks`:

```typescript
function snapshot(): AssistantStoreSnapshot {
  const state = useTaskStore.getState();
  return {
    selectedDate: state.selectedDate,
    tasks: state.tasks,
    backlogTasks: state.backlogTasks,
    categories: state.categories,
    allTasks: state.allTasks
  };
}
```

5. In `send`, reset and feed steps, and pass `onStep`:

```typescript
    set({ messages: history, status: "thinking", error: null, steps: [] });
    await get().loadInsights();
    try {
      const result = await runAssistantTurn({
        settings: useSettingsStore.getState().settings,
        snapshot: snapshot(),
        messages: toChatTurns(history),
        insights: get().insights,
        onStep: (label) => set({ steps: [...get().steps, label] })
      });
      // ...existing assistantMessage construction...
      set({ messages: [...history, assistantMessage], status: "idle", steps: [] });
    } catch (error) {
      // ...existing catch, plus:
      set((s) => ({ ...s, steps: [] }));
    }
```

6. Add `applyAll`, reusing the existing single `applyAction`:

```typescript
  applyAll: async (messageId) => {
    const ids = nextAfterApplyAll(get().messages, messageId);
    for (const actionId of ids) {
      await get().applyAction(messageId, actionId);
    }
  },
```

7. Ensure `clear` also resets `steps: []`.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn test src/stores/assistantStore.applyAll.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/assistantStore.ts src/stores/assistantStore.applyAll.test.ts
git commit -m "feat: assistant store step trace, bulk apply, and full task list"
```

---

## Task 9: UI — step trace, grouped plan, Approve all, Plan-this

UI wiring. Verified by `yarn build` + manual run (no new unit tests; logic lives in tested stores).

**Files:**
- Modify: `src/components/assistant/MessageList.tsx`, `src/components/assistant/AssistantPanel.tsx`, `src/components/assistant/Composer.tsx`

- [ ] **Step 1: Render the live step trace**

In `AssistantPanel.tsx` (or wherever the thinking indicator lives), read `steps` and `status` from the store and render the trace while thinking:

```tsx
const steps = useAssistantStore((s) => s.steps);
const status = useAssistantStore((s) => s.status);
// ...
{status === "thinking" && steps.length > 0 && (
  <ul className="px-4 py-2 text-xs text-muted-foreground space-y-1">
    {steps.map((label, i) => (
      <li key={i} className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-primary/60" />
        {label}
      </li>
    ))}
  </ul>
)}
```

- [ ] **Step 2: Group a multi-task plan with an Approve-all control**

In `MessageList.tsx`, where a message's `actions` are mapped to `ActionCard`s, detect a plan (2+ pending `create_task` actions) and render a header with a bulk button:

```tsx
const applyAll = useAssistantStore((s) => s.applyAll);
// inside the per-message render, before the action cards:
const pendingCreates = (message.actions ?? []).filter(
  (a) => a.status === "pending" && a.type === "create_task"
);
{pendingCreates.length >= 2 && (
  <div className="flex items-center justify-between px-1 pb-1">
    <span className="text-xs font-medium text-muted-foreground">
      Proposed plan — {pendingCreates.length} tasks
    </span>
    <button
      type="button"
      onClick={() => void applyAll(message.id)}
      className="text-xs font-medium text-primary hover:underline"
    >
      Approve all
    </button>
  </div>
)}
```

(Keep the existing per-card `ActionCard` mapping unchanged below this header.)

- [ ] **Step 3: Add a "Plan this" affordance to the Composer**

In `Composer.tsx`, when the textarea holds a long paste (e.g. `value.trim().length > 200`), show a hint button that prefixes an organizing instruction before sending:

```tsx
const isLongDump = value.trim().length > 200;
// near the send button:
{isLongDump && (
  <button
    type="button"
    onClick={() => {
      const text = `Organize the following into well-scoped tasks. Check for duplicates first and estimate from my history:\n\n${value.trim()}`;
      onSend(text); // use the same send path the form submit uses
      setValue("");
    }}
    className="text-xs font-medium text-primary hover:underline"
  >
    Plan this
  </button>
)}
```

Wire `onSend` to the same `useAssistantStore().send` the form already calls. If the Composer currently calls `send` directly, call it directly here too.

- [ ] **Step 4: Type-check and build**

Run: `yarn build`
Expected: PASS (tsc + vite), no type errors. Fix any prop/type mismatches surfaced (e.g. `steps` selector typing).

- [ ] **Step 5: Manual verification**

Run the app (`yarn tauri dev` or the project's run command). With an API key configured in Settings → AI:
1. Paste a multi-item brain-dump into the assistant and click **Plan this**. Confirm the step trace appears ("Scanning your existing tasks…"), then a grouped "Proposed plan — N tasks" with **Approve all**.
2. Confirm one proposed task references a **new project** and that approving it creates the category.
3. Paste a duplicate of an existing task; confirm the assistant declines to recreate it and names the existing task.

- [ ] **Step 6: Commit**

```bash
git add src/components/assistant/MessageList.tsx src/components/assistant/AssistantPanel.tsx src/components/assistant/Composer.tsx
git commit -m "feat: assistant UI for step trace, grouped plan, approve-all, and Plan this"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `yarn test`
Expected: PASS — all suites green, coverage ≥ before.

- [ ] **Step 2: Build**

Run: `yarn build`
Expected: PASS.

- [ ] **Step 3: Commit any final fixes, then summarize**

```bash
git add -A && git commit -m "test: green build and suite for AI-native phase 1" || echo "nothing to commit"
```

---

## Self-Review Notes (coverage check)

- Provider-agnostic loop → Task 2 (parser), Task 6 (loop). ✓
- Read tools `search_tasks`/`get_calibration` → Task 1. ✓
- Auto-project via `create_task` ensure-or-create → Task 4 + Task 7. ✓
- Dedup (skip + notify) → Task 5 prompt rule, exercised in Task 9 manual step. ✓
- Visible reasoning via step trace → Task 6 `onStep`, Task 8 `steps`, Task 9 render. ✓
- Grouped plan + Approve all → Task 8 `applyAll`, Task 9 UI. ✓
- `allTasks` into context → Task 3. ✓
- Invariants (TS math, propose-then-confirm, additive) → calibration via tool only; cards unchanged; single final response still works (Task 6 second test). ✓
