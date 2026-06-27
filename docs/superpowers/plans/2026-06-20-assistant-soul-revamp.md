# Assistant Soul Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the in-app assistant a configurable Hermes-style "Soul" identity that replaces the hardcoded day-planning framing, and add the ability to edit and bulk-operate on existing tasks (`update_task` + `list_tasks`) — all still propose-then-confirm.

**Architecture:** The Soul becomes slot #1 of the system prompt (replacing the hardcoded identity line) via a new `soul.ts`. The assistant context carries the user's `assistantName`/`assistantSoul` from settings plus an `allTaskRefs` index so actions can validate ids for *any* task (not just today+backlog). A new `update_task` action and `list_tasks` read tool unlock editing and bulk categorization. The Pi-style loop is unchanged except a higher step cap.

**Tech Stack:** TypeScript, React 18, Zustand, Vitest. Verify with `yarn test` (vitest run) and `yarn build` (tsc + vite).

---

## Background for the implementer

- The assistant lives in `src/services/ai/assistant/`. The flow is: `contextBuilder.ts` → `systemPrompt.ts` → `agentLoop.ts` (read-only "lookups" tool loop) → `responseParser.ts` → validated `actions` rendered as confirm cards.
- Actions are declared in `actions.ts` (an `ACTION_REGISTRY` of descriptors with `validate`/`describe`/`execute`) and typed in `types.ts` (`AssistantActionType`, `AssistantTaskStore`).
- Read tools are in `tools.ts` (a `TOOL_REGISTRY`); the model requests them with `{ "lookups": [...] }`, parsed by `parseLoopStep` in `responseParser.ts`.
- The real task store (`src/stores/taskStore.ts`) is passed directly as the `AssistantTaskStore`. Its methods return `MutationResult = { ok: true } | { ok: false; message: string }`, which is structurally identical to the assistant's `ActionResult` — so `taskStore.updateTask` already satisfies the interface; **no adapter is needed**.
- `taskStore.updateTask(id, UpdateTaskInput)` and `ensureCategory(name)` already exist. `assistantStore.applyAll` already applies all pending actions in one click.
- Run a single test file with: `yarn test <path>`. Run everything with `yarn test`. Build with `yarn build`.

Key existing types (do not redefine):
```ts
// src/types/task.ts
export type TaskPriority = "low" | "medium" | "high";
export type UpdateTaskInput = Partial<Pick<Task,
  "title" | "description" | "category_id" | "priority" | "estimated_minutes" | "due_date" | "status" | ...>>;
// src/services/ai/assistant/types.ts
export type ActionResult = { ok: true } | { ok: false; message: string };
```

---

## Task 1: Add `assistantName` and `assistantSoul` settings

**Files:**
- Modify: `src/types/settings.ts`

- [ ] **Step 1: Add the two fields to `AppSettings` and `DEFAULT_SETTINGS`**

In `src/types/settings.ts`, inside the `AppSettings` type, add after `assistantProfile`:
```ts
  /** The assistant's display name (its "soul" answers to this). */
  assistantName: string;
  /** Markdown SOUL.md-style identity block. Blank → the shipped DEFAULT_SOUL is used. */
  assistantSoul: string;
```
In `DEFAULT_SETTINGS`, add after `assistantProfile: ""`:
```ts
  assistantName: "Yolo Assistant",
  assistantSoul: "",
```

- [ ] **Step 2: Verify the build typechecks**

Run: `yarn build`
Expected: PASS (no type errors). The settings store/repository persist `AppSettings` generically, so no further wiring is needed for persistence.

- [ ] **Step 3: Commit**

```bash
git add src/types/settings.ts
git commit -m "feat: add assistantName and assistantSoul settings"
```

---

## Task 2: Create the Soul builder (`soul.ts`)

**Files:**
- Create: `src/services/ai/assistant/soul.ts`
- Test: `src/services/ai/assistant/soul.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/ai/assistant/soul.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SOUL, buildSoulBlock } from "./soul";

describe("buildSoulBlock", () => {
  it("uses DEFAULT_SOUL when soul is blank", () => {
    const block = buildSoulBlock("Yolo Assistant", "");
    expect(block).toContain(DEFAULT_SOUL);
  });

  it("uses the custom soul when provided and omits the default", () => {
    const block = buildSoulBlock("Hermes", "## Identity\nI am Hermes.");
    expect(block).toContain("I am Hermes.");
    expect(block).not.toContain(DEFAULT_SOUL);
  });

  it("includes the name in the product preamble", () => {
    expect(buildSoulBlock("Hermes", "")).toContain("Hermes");
  });

  it("falls back to a default name when blank", () => {
    expect(buildSoulBlock("   ", "")).toContain("Yolo Assistant");
  });

  it("always keeps the product grounding (confirm cards, never mutate directly)", () => {
    const block = buildSoulBlock("X", "## Identity\nDo anything.");
    expect(block.toLowerCase()).toContain("confirm card");
    expect(block.toLowerCase()).toContain("never mutate");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/services/ai/assistant/soul.test.ts`
Expected: FAIL (cannot find module `./soul`).

- [ ] **Step 3: Write the implementation**

Create `src/services/ai/assistant/soul.ts`:
```ts
/** Shipped identity used when the user has not written their own SOUL. Frames the
 *  assistant as a broadly capable operator — day-planning is one strength, not the
 *  whole job — so default behavior is not locked to a single workflow. */
export const DEFAULT_SOUL = `## Identity
You are a capable, trustworthy operating partner for the user's work and time. You help them plan, run, and review their day — and you can work with any of their tasks and categories, not just one fixed workflow. You think a step ahead and take initiative.

## Style
Warm, direct, and brief — like a sharp chief of staff who respects the user's time. Lead with the answer. Plain language, never padded.

## Avoid
Never nag or moralize. Never invent tasks, numbers, or history that aren't in your context or that the user didn't mention. Don't restate every field — the confirm cards carry the detail.

## Defaults
When a request is broad ("clean up my tasks", "categorize everything"), look up the relevant set first, then propose concrete changes the user can approve. When one essential detail is missing, make a sensible assumption, state it in one line, and still propose your best attempt.`;

const PRODUCT_PREAMBLE =
  'You are {name}, the AI assistant inside Yolo, a desktop productivity app whose motto is "make your time count". ' +
  "Every change you propose is shown to the user as an editable confirm card they approve before anything happens — you never mutate their data directly. " +
  "Reference existing tasks by the id shown in brackets, and never guess an id.";

/** Compose slot #1 of the system prompt: product grounding + the user's (or default) soul. */
export function buildSoulBlock(name: string, soul: string): string {
  const safeName = name.trim().length > 0 ? name.trim() : "Yolo Assistant";
  const body = soul.trim().length > 0 ? soul.trim() : DEFAULT_SOUL;
  return [PRODUCT_PREAMBLE.replace("{name}", safeName), "", body].join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/services/ai/assistant/soul.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/soul.ts src/services/ai/assistant/soul.test.ts
git commit -m "feat: add Soul identity builder for the assistant"
```

---

## Task 3: Thread name/soul + all-task index into the assistant context

**Files:**
- Modify: `src/services/ai/assistant/types.ts` (AssistantContext)
- Modify: `src/services/ai/assistant/contextBuilder.ts`
- Test: `src/services/ai/assistant/contextBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/services/ai/assistant/contextBuilder.test.ts` (inside the existing top-level `describe`, reusing the file's existing snapshot-building helpers if present; otherwise build a minimal snapshot inline):
```ts
it("threads assistantName, assistantSoul, and an all-task index", () => {
  const ctx = buildAssistantContext({
    selectedDate: "2026-06-20",
    tasks: [],
    backlogTasks: [],
    categories: [],
    allTasks: [
      { id: "t1", title: "Far-future task", status: "todo", priority: "low",
        estimated_minutes: null, category_id: null, description: null, due_date: "2026-09-01",
        template_id: null, planned_start_time: null, planned_end_time: null, sort_order: null,
        created_at: "", updated_at: "", completed_at: null, dropped_at: null }
    ],
    assistantName: "Hermes",
    assistantSoul: "## Identity\nI am Hermes."
  });
  expect(ctx.assistantName).toBe("Hermes");
  expect(ctx.assistantSoul).toContain("I am Hermes.");
  expect(ctx.allTaskRefs).toEqual([{ id: "t1", title: "Far-future task" }]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/services/ai/assistant/contextBuilder.test.ts`
Expected: FAIL (`assistantName`/`allTaskRefs` do not exist on the context / snapshot type).

- [ ] **Step 3: Extend the context type**

In `src/services/ai/assistant/types.ts`, add to `AssistantContext`:
```ts
  assistantName: string; // the assistant's configured name
  assistantSoul: string; // raw SOUL markdown ("" → default soul applied downstream)
  allTaskRefs: { id: string; title: string }[]; // id+title for EVERY task, for id validation
```

- [ ] **Step 4: Extend the snapshot + builder**

In `src/services/ai/assistant/contextBuilder.ts`, add to `AssistantStoreSnapshot`:
```ts
  assistantName?: string;
  assistantSoul?: string;
```
In `buildAssistantContext`, add these to the returned object (before the spread blocks):
```ts
    assistantName: snapshot.assistantName ?? "",
    assistantSoul: snapshot.assistantSoul ?? "",
    allTaskRefs: snapshot.allTasks.map((task) => ({ id: task.id, title: task.title })),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/services/ai/assistant/contextBuilder.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/assistant/types.ts src/services/ai/assistant/contextBuilder.ts src/services/ai/assistant/contextBuilder.test.ts
git commit -m "feat: thread assistant name/soul and all-task index into context"
```

---

## Task 4: Make the system prompt use the Soul as slot #1

**Files:**
- Modify: `src/services/ai/assistant/systemPrompt.ts`
- Test: `src/services/ai/assistant/systemPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/services/ai/assistant/systemPrompt.test.ts`. Use the file's existing context factory if one exists; otherwise build a minimal `AssistantContext` with the new required fields (`assistantName`, `assistantSoul`, `allTaskRefs: []`).
```ts
it("renders the Soul as slot #1 and drops the hardcoded day-planning identity", () => {
  const prompt = buildAssistantSystemPrompt(makeCtx({ assistantName: "Hermes", assistantSoul: "" }));
  expect(prompt).toContain("operating partner"); // a phrase from DEFAULT_SOUL
  expect(prompt).toContain("Hermes");
  expect(prompt).not.toContain("focused day-planning companion");
});

it("uses a custom soul verbatim when provided", () => {
  const prompt = buildAssistantSystemPrompt(makeCtx({ assistantSoul: "## Identity\nI am a pirate." }));
  expect(prompt).toContain("I am a pirate.");
});
```
If `makeCtx` does not already exist in the file, add this helper near the top of the test file:
```ts
function makeCtx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  return {
    today: "2026-06-20",
    categories: [],
    tasks: [],
    backlog: [],
    assistantName: "Yolo Assistant",
    assistantSoul: "",
    allTaskRefs: [],
    ...overrides
  };
}
```
(Import `AssistantContext` from `./types` if not already imported.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/services/ai/assistant/systemPrompt.test.ts`
Expected: FAIL — the prompt still contains "focused day-planning companion".

- [ ] **Step 3: Swap slot #1 for the soul block**

In `src/services/ai/assistant/systemPrompt.ts`:

Add the import at the top:
```ts
import { buildSoulBlock } from "./soul";
```
In `buildAssistantSystemPrompt`, replace these two opening lines of the `lines` array:
```ts
    'You are the Yolo Assistant, a focused day-planning companion inside Yolo, a desktop app whose motto is "make your time count".',
    "You help the user plan and adjust their day. You never invent tasks the user did not ask for, and you reference existing tasks by the id shown in brackets.",
```
with:
```ts
    buildSoulBlock(ctx.assistantName, ctx.assistantSoul),
```
Leave the rest of the array (the `About the user` block from `ctx.profile`, the actions catalog, tools, context, briefing, retro) unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/services/ai/assistant/systemPrompt.test.ts`
Expected: PASS. If other existing tests in this file asserted on the old identity string, update them to assert on the soul block instead.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/systemPrompt.ts src/services/ai/assistant/systemPrompt.test.ts
git commit -m "feat: use the configurable Soul as system-prompt slot #1"
```

---

## Task 5: Add the `update_task` action

**Files:**
- Modify: `src/services/ai/assistant/types.ts` (`AssistantActionType`, `AssistantTaskStore`)
- Modify: `src/services/ai/assistant/actions.ts`
- Test: `src/services/ai/assistant/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/services/ai/assistant/actions.test.ts`. Reuse the file's existing context factory; it must include a task the action can target and at least one category. If the existing factory only exposes `tasks`/`backlog`, also set `allTaskRefs` so id validation can find ids outside today. Example tests:
```ts
describe("update_task", () => {
  const ctx = makeCtx({
    tasks: [{ id: "t1", title: "Anki feature", status: "todo", priority: "low",
      estimatedMinutes: null, categoryId: null }],
    categories: [{ id: "c-jp", name: "Japanese" }],
    allTaskRefs: [{ id: "t1", title: "Anki feature" }]
  });

  it("validates a partial update and describes the diff", () => {
    const action = validateAction(
      { type: "update_task", task_id: "t1", category: "Japanese", priority: "high" }, ctx
    );
    expect(action).not.toBeNull();
    expect(action!.summary).toContain("Anki feature");
    expect(action!.summary).toContain("Japanese");
    expect(action!.summary).toContain("high");
  });

  it("rejects an update with no changed fields", () => {
    expect(validateAction({ type: "update_task", task_id: "t1" }, ctx)).toBeNull();
  });

  it("rejects an unknown task id", () => {
    expect(validateAction({ type: "update_task", task_id: "nope", title: "x" }, ctx)).toBeNull();
  });

  it("marks a brand-new category for creation on apply", async () => {
    const action = validateAction(
      { type: "update_task", task_id: "t1", category: "Reading" }, ctx
    );
    expect(action).not.toBeNull();
    const store = makeFakeStore();
    await ACTION_REGISTRY.update_task.execute(action!.params, store);
    expect(store.ensureCategory).toHaveBeenCalledWith("Reading");
    expect(store.updateTask).toHaveBeenCalled();
  });
});
```
If `makeCtx` / `makeFakeStore` helpers don't already exist in this test file, add minimal ones: `makeCtx` returns an `AssistantContext` with the new required fields (`assistantName: ""`, `assistantSoul: ""`, `allTaskRefs: []`, plus any overrides); `makeFakeStore` returns an object with `vi.fn()` for `createTask`, `updateTask` (resolving `{ ok: true }`), `ensureCategory` (resolving `"c-new"`), and the other `AssistantTaskStore` methods.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/services/ai/assistant/actions.test.ts`
Expected: FAIL — `update_task` is not in `ACTION_REGISTRY`.

- [ ] **Step 3: Extend the types**

In `src/services/ai/assistant/types.ts`:
- Add `| "update_task"` to the `AssistantActionType` union.
- Add to the `AssistantTaskStore` interface (and import `UpdateTaskInput`):
```ts
  updateTask(taskId: string, input: UpdateTaskInput): Promise<ActionResult>;
```
Update the existing task-type import line to include `UpdateTaskInput`:
```ts
import type { CreateTaskInput, TaskPriority, TaskStatus, UpdateTaskInput } from "../../../types";
```

- [ ] **Step 4: Make id validation aware of all tasks, then add the descriptor**

In `src/services/ai/assistant/actions.ts`:

Add `UpdateTaskInput` to the type import from `"../../../types"`.

Replace the `knownTaskId` and `titleOf` helpers with all-task-aware versions:
```ts
function allKnownTasks(ctx: AssistantContext): { id: string; title: string }[] {
  return [...ctx.tasks, ...ctx.backlog, ...ctx.allTaskRefs];
}

function knownTaskId(raw: Record<string, unknown>, ctx: AssistantContext): string {
  const id = str(raw, "task_id");
  if (!allKnownTasks(ctx).some((task) => task.id === id)) {
    throw new Error(`task_id "${id}" is not a known task`);
  }
  return id;
}

function titleOf(id: string, ctx: AssistantContext): string {
  return allKnownTasks(ctx).find((task) => task.id === id)?.title ?? id;
}
```
Add a category-name helper near the other helpers:
```ts
function categoryName(id: string, ctx: AssistantContext): string {
  return ctx.categories.find((category) => category.id === id)?.name ?? id;
}
```
Add the params type and descriptor (place the descriptor next to `createTask`):
```ts
type UpdateParams = {
  task_id: string;
  title: string; // current title, for the describe() label
  changes: UpdateTaskInput;
  new_category_name: string | null;
  summaryParts: string[];
};

const updateTask: ActionDescriptor<UpdateParams> = {
  type: "update_task",
  destructive: false,
  promptSpec: {
    name: "update_task",
    when: "the user wants to change one or more fields of an EXISTING task (title, description, category, priority, estimate) — use this to categorize or re-prioritize tasks that already exist",
    params:
      'task_id (required), and at least one of: title, description (a sentence; pass "" to clear), category (existing name/id OR a new project name), priority ("low"|"medium"|"high"), estimated_minutes (number)'
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    const changes: UpdateTaskInput = {};
    const parts: string[] = [];

    const title = optionalStr(raw, "title");
    if (title) {
      changes.title = title;
      parts.push(`title → "${title}"`);
    }

    if ("description" in raw) {
      const desc = optionalStr(raw, "description");
      changes.description = desc; // null clears it
      parts.push(desc ? "description updated" : "description cleared");
    }

    const priorityRaw = raw.priority;
    if (priorityRaw === "low" || priorityRaw === "medium" || priorityRaw === "high") {
      changes.priority = priorityRaw;
      parts.push(`priority → ${priorityRaw}`);
    }

    if (typeof raw.estimated_minutes === "number" && raw.estimated_minutes > 0) {
      changes.estimated_minutes = raw.estimated_minutes;
      parts.push(`estimate → ${raw.estimated_minutes}m`);
    }

    let new_category_name: string | null = null;
    if (typeof raw.category === "string" && raw.category.trim().length > 0) {
      const resolved = resolveCategoryOrNew(raw, ctx);
      if (resolved.category_id) {
        changes.category_id = resolved.category_id;
        parts.push(`category → ${categoryName(resolved.category_id, ctx)}`);
      } else if (resolved.new_category_name) {
        new_category_name = resolved.new_category_name;
        parts.push(`category → new "${resolved.new_category_name}"`);
      }
    }

    if (parts.length === 0) {
      throw new Error("update_task needs at least one field to change");
    }
    return { task_id: id, title: titleOf(id, ctx), changes, new_category_name, summaryParts: parts };
  },
  describe: (params) => `Update "${params.title}": ${params.summaryParts.join(", ")}`,
  execute: async (params, store) => {
    let changes = params.changes;
    if (params.new_category_name) {
      const categoryId = await store.ensureCategory(params.new_category_name);
      changes = { ...changes, category_id: categoryId };
    }
    return store.updateTask(params.task_id, changes);
  }
};
```
Register it in `ACTION_REGISTRY`:
```ts
  create_task: createTask,
  update_task: updateTask,
  reschedule_task: rescheduleTask,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/services/ai/assistant/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/assistant/types.ts src/services/ai/assistant/actions.ts src/services/ai/assistant/actions.test.ts
git commit -m "feat: add update_task action for editing existing tasks"
```

---

## Task 6: Add the `list_tasks` read tool

**Files:**
- Modify: `src/services/ai/assistant/tools.ts` (`LookupRequest`, `ToolDeps`, registry)
- Modify: `src/services/ai/assistant/responseParser.ts` (`parseLoopStep` cleaner)
- Modify: `src/services/ai/assistant/agentLoop.ts` (pass `categories` into `ToolDeps`)
- Test: `src/services/ai/assistant/tools.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/services/ai/assistant/tools.test.ts`:
```ts
describe("list_tasks", () => {
  const tasks = [
    { id: "t1", title: "Write spec", status: "todo", priority: "high",
      estimated_minutes: null, category_id: "c1", due_date: null,
      description: null, template_id: null, planned_start_time: null, planned_end_time: null,
      sort_order: null, created_at: "", updated_at: "", completed_at: null, dropped_at: null },
    { id: "t2", title: "Email Bob", status: "done", priority: "low",
      estimated_minutes: null, category_id: null, due_date: "2026-06-21",
      description: null, template_id: null, planned_start_time: null, planned_end_time: null,
      sort_order: null, created_at: "", updated_at: "", completed_at: null, dropped_at: null }
  ];
  const deps = { allTasks: tasks, insights: null, history: [], categories: [{ id: "c1", name: "Work" }] };

  it("lists all tasks when unfiltered", () => {
    const out = executeLookup({ tool: "list_tasks" }, deps as never);
    expect(out).toContain("t1");
    expect(out).toContain("t2");
  });

  it("filters by status", () => {
    const out = executeLookup({ tool: "list_tasks", status: "done" }, deps as never);
    expect(out).toContain("t2");
    expect(out).not.toContain("t1");
  });

  it("filters uncategorized with category=none", () => {
    const out = executeLookup({ tool: "list_tasks", category: "none" }, deps as never);
    expect(out).toContain("t2");
    expect(out).not.toContain("t1");
  });

  it("resolves a category by name", () => {
    const out = executeLookup({ tool: "list_tasks", category: "Work" }, deps as never);
    expect(out).toContain("t1");
    expect(out).not.toContain("t2");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/services/ai/assistant/tools.test.ts`
Expected: FAIL — unknown tool `list_tasks` (and `categories` missing on `ToolDeps`).

- [ ] **Step 3: Extend `LookupRequest`, `ToolDeps`, and add the executor**

In `src/services/ai/assistant/tools.ts`:

Extend `LookupRequest`:
```ts
export type LookupRequest = {
  tool: string;
  query?: string;
  category?: string;
  date?: string;
  status?: string;
  undated?: boolean;
};
```
Extend `ToolDeps`:
```ts
export type ToolDeps = {
  allTasks: Task[];
  insights: RetrospectiveInsights | null;
  history: RecallEntry[];
  categories: { id: string; name: string }[];
};
```
Add a constant and the executor (near the other tool functions):
```ts
const MAX_LIST_RESULTS = 40;

function catLabelFor(categoryId: string | null, deps: ToolDeps): string {
  if (!categoryId) return "uncategorized";
  return deps.categories.find((category) => category.id === categoryId)?.name ?? categoryId;
}

function listTasks(req: LookupRequest, deps: ToolDeps): string {
  let tasks = deps.allTasks;

  const status = (req.status ?? "").trim().toLowerCase();
  if (status) tasks = tasks.filter((task) => task.status.toLowerCase() === status);

  const cat = (req.category ?? "").trim().toLowerCase();
  if (cat === "none") {
    tasks = tasks.filter((task) => !task.category_id);
  } else if (cat) {
    const match = deps.categories.find(
      (category) => category.id.toLowerCase() === cat || category.name.toLowerCase() === cat
    );
    const wantId = (match?.id ?? cat).toLowerCase();
    tasks = tasks.filter((task) => (task.category_id ?? "").toLowerCase() === wantId);
  }

  if (req.undated === true) tasks = tasks.filter((task) => !task.due_date);

  if (tasks.length === 0) return "list_tasks: no tasks match those filters.";

  const shown = tasks.slice(0, MAX_LIST_RESULTS);
  const lines = shown.map(
    (task) =>
      `- [${task.id}] "${task.title}" (${task.status}, ${catLabelFor(task.category_id, deps)}${task.due_date ? `, due ${task.due_date}` : ""})`
  );
  const more =
    tasks.length > shown.length
      ? [`…and ${tasks.length - shown.length} more — narrow with status/category/undated.`]
      : [];
  return [`list_tasks found ${tasks.length}:`, ...lines, ...more].join("\n");
}
```
Register it in `TOOL_REGISTRY`:
```ts
  list_tasks: {
    name: "list_tasks",
    when: "you need to enumerate a set of tasks to operate on in bulk (search_tasks needs a query and can't list everything)",
    params: 'status (optional, "todo"|"doing"|"paused"|"done"|"dropped"), category (optional, a name/id, or "none" for uncategorized), undated (optional boolean — backlog only)',
    execute: listTasks
  },
```

- [ ] **Step 4: Pass the new fields through `parseLoopStep`**

In `src/services/ai/assistant/responseParser.ts`, inside `parseLoopStep`'s `.map((entry) => ({ ... }))`, add the two fields:
```ts
          .map((entry) => ({
            tool: String(entry.tool),
            query: typeof entry.query === "string" ? entry.query : undefined,
            category: typeof entry.category === "string" ? entry.category : undefined,
            date: typeof entry.date === "string" ? entry.date : undefined,
            status: typeof entry.status === "string" ? entry.status : undefined,
            undated: typeof entry.undated === "boolean" ? entry.undated : undefined
          }));
```

- [ ] **Step 5: Supply `categories` to `ToolDeps` in the loop**

In `src/services/ai/assistant/agentLoop.ts`, update the `toolDeps` construction:
```ts
  const toolDeps: ToolDeps = {
    allTasks: input.snapshot.allTasks,
    insights: input.insights ?? null,
    history: input.history ?? [],
    categories: input.snapshot.categories.map((category) => ({ id: category.id, name: category.name }))
  };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test src/services/ai/assistant/tools.test.ts src/services/ai/assistant/responseParser.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/ai/assistant/tools.ts src/services/ai/assistant/responseParser.ts src/services/ai/assistant/agentLoop.ts src/services/ai/assistant/tools.test.ts
git commit -m "feat: add list_tasks read tool for bulk task enumeration"
```

---

## Task 7: Loop headroom + bulk prompt guidance

**Files:**
- Modify: `src/services/ai/assistant/agentLoop.ts` (`MAX_STEPS`, step label)
- Modify: `src/services/ai/assistant/systemPrompt.ts` (bulk guidance)
- Test: `src/services/ai/assistant/agentLoop.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/services/ai/assistant/agentLoop.test.ts` a test that drives a `list_tasks` lookup followed by multiple `update_task` actions, using the file's existing `generateChat` stub pattern (a queue of canned responses). Mirror the existing tests' snapshot/settings setup; the key assertions:
```ts
it("supports a bulk path: list_tasks lookup then multiple update_task actions", async () => {
  const responses = [
    JSON.stringify({ lookups: [{ tool: "list_tasks", category: "none" }] }),
    JSON.stringify({
      reply: "Categorized your two tasks.",
      actions: [
        { type: "update_task", task_id: "t1", category: "Work" },
        { type: "update_task", task_id: "t2", category: "Work" }
      ]
    })
  ];
  let i = 0;
  const result = await runAgentLoop(makeLoopInput(/* snapshot with t1,t2 + category Work */), {
    generateChat: async () => responses[i++]
  });
  expect(result.actions).toHaveLength(2);
  expect(result.actions.every((a) => a.type === "update_task")).toBe(true);
});
```
If the test file lacks a `makeLoopInput` helper, add one that returns a valid `RunAgentLoopInput` whose `snapshot.allTasks` contains `t1`/`t2` (both `category_id: null`) and `snapshot.categories` contains `{ id: "c1", name: "Work" }`, with `assistantName`/`assistantSoul` set to `""`.

- [ ] **Step 2: Run the test to verify it fails (or is flaky on step cap)**

Run: `yarn test src/services/ai/assistant/agentLoop.test.ts`
Expected: the new test runs; if `STEP_LABELS` lacks `list_tasks` the step label falls back (harmless). Primary purpose is to lock the bulk path. If it already passes, proceed — the remaining steps still apply guidance/labels.

- [ ] **Step 3: Raise the step cap and add the label**

In `src/services/ai/assistant/agentLoop.ts`:
```ts
const MAX_STEPS = 6;
```
Add to `STEP_LABELS`:
```ts
  list_tasks: "Listing your tasks…",
```

- [ ] **Step 4: Add bulk guidance to the prompt**

In `src/services/ai/assistant/systemPrompt.ts`, extend the existing `TOOL_PROTOCOL` array with one line before the closing `"",` / "Read tools available:" section:
```ts
  "- To act on many tasks at once (e.g. \"categorize everything\", \"re-prioritize my backlog\"), use list_tasks to fetch the set, then propose one update_task per task. If more than ~20 tasks would change, propose the first batch and ask before continuing.",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test src/services/ai/assistant/agentLoop.test.ts src/services/ai/assistant/systemPrompt.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/assistant/agentLoop.ts src/services/ai/assistant/systemPrompt.ts src/services/ai/assistant/agentLoop.test.ts
git commit -m "feat: loop headroom and bulk-edit guidance for the assistant"
```

---

## Task 8: Feed name/soul from the assistant store snapshot

**Files:**
- Modify: `src/stores/assistantStore.ts` (`snapshot()`)

- [ ] **Step 1: Add the settings to the snapshot**

In `src/stores/assistantStore.ts`, in the `snapshot()` function, add to the returned object:
```ts
    assistantName: useSettingsStore.getState().settings.assistantName,
    assistantSoul: useSettingsStore.getState().settings.assistantSoul,
```
(Place them alongside the existing `profile:` and `targetMinutes:` lines.)

- [ ] **Step 2: Verify the build typechecks and the suite is green**

Run: `yarn build && yarn test`
Expected: PASS. This wires the configured Soul into every live turn.

- [ ] **Step 3: Commit**

```bash
git add src/stores/assistantStore.ts
git commit -m "feat: feed assistant name/soul into live turns"
```

---

## Task 9: Settings UI — Name + Soul editor

**Files:**
- Modify: `src/components/settings/SettingsPage.tsx`

- [ ] **Step 1: Import the default soul**

At the top of `src/components/settings/SettingsPage.tsx`, add:
```ts
import { DEFAULT_SOUL } from "../../services/ai/assistant/soul";
```

- [ ] **Step 2: Add the Name + Soul fields above "About me"**

In `src/components/settings/SettingsPage.tsx`, immediately before the existing `<Field label="About me" …>` block (around line 236), insert:
```tsx
              <Field
                label="Assistant name"
                hint="What your assistant is called."
              >
                <Input
                  type="text"
                  placeholder="Yolo Assistant"
                  value={settings.assistantName}
                  onChange={(event) => void updateSetting("assistantName", event.target.value)}
                />
              </Field>
              <div className="mt-4">
                <Field
                  label="Soul"
                  hint="Defines who your assistant is and how it behaves — its identity, voice, and boundaries. Leave blank to use the default."
                >
                  <textarea
                    rows={10}
                    placeholder={DEFAULT_SOUL}
                    value={settings.assistantSoul}
                    onChange={(event) => void updateSetting("assistantSoul", event.target.value)}
                    className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => void updateSetting("assistantSoul", DEFAULT_SOUL)}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  Reset to default soul
                </button>
              </div>
```

- [ ] **Step 3: Relabel "About me" to disambiguate from the Soul**

Change the existing `About me` `Field`'s `hint` to:
```tsx
                hint="About you — the assistant reads this to tailor its work to your role, projects, hours, and goals."
```
(Leave its `label="About me"` and the textarea wiring unchanged.)

- [ ] **Step 4: Verify the build and run the app**

Run: `yarn build`
Expected: PASS. Then manually confirm in `yarn tauri dev` (or `yarn dev`) that Settings shows Assistant name, Soul (with default as placeholder), Reset button, and About me — and that edits persist across reload.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/SettingsPage.tsx
git commit -m "feat: Settings UI for assistant name and Soul"
```

---

## Task 10: Documentation

**Files:**
- Modify: `docs/assistant-guide.md`

- [ ] **Step 1: Document the Soul and new capabilities**

In `docs/assistant-guide.md`, add a section describing:
- **Soul (identity):** what `assistantName` / `assistantSoul` are, that the Soul is slot #1 of the system prompt and *replaces* the old hardcoded identity, the four suggested sections (Identity / Style / Avoid / Defaults), and that blank → `DEFAULT_SOUL`.
- **Editing existing tasks:** the `update_task` action (title/description/category/priority/estimate), still propose-then-confirm.
- **Bulk operations:** `list_tasks` + many `update_task` cards + "Apply all", and the ~20-task confirm-first guardrail.
- Note the propose-then-confirm invariant is unchanged.

Keep it consistent with the existing tone/structure of that file (read the file first and match its headings).

- [ ] **Step 2: Final full verification**

Run: `yarn test && yarn build`
Expected: BOTH PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/assistant-guide.md
git commit -m "docs: document the assistant Soul and editing/bulk capabilities"
```

---

## Self-review notes (for the implementer)

- **No `update_category` / time-entry editing** is in scope — deferred by design.
- The propose-then-confirm invariant holds: every `update_task` is a confirm card; nothing in the prompt or Soul can bypass `validateAction` or the card layer.
- `MutationResult` ≡ `ActionResult` structurally, so `taskStore.updateTask` satisfies `AssistantTaskStore.updateTask` with no adapter.
- `allTaskRefs` is **not** rendered into the prompt (it's only for id validation), so prompt size stays Pi-minimal; `list_tasks` output is capped at 40.
- If any pre-existing test asserted on the removed identity string or on `ToolDeps` without `categories`, update it as part of the task that changes that surface.
