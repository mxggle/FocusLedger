# Yolo Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app slide-over chat assistant that doubles as a day planner — it reads the user's day and proposes confirmable changes to tasks, applied via the existing `taskStore`.

**Architecture:** The assistant talks to the existing provider-agnostic AI layer through a new multi-turn `generateChat`. The model returns structured JSON (`{ reply, actions[] }`); a parser validates it against an **action registry** (the extension point), and the UI renders each action as a propose-then-confirm card. Nothing mutates until the user clicks Apply. Conversation is ephemeral (zustand), with a DB-ready message/action shape.

**Tech Stack:** React 18 + TypeScript, Zustand, Radix Dialog, framer-motion, lucide-react, Tailwind semantic tokens, vitest. Reuses `src/services/ai/` (providers/aiClient) and `taskStore`.

---

## File Structure

```
src/services/ai/
  providers.ts          MODIFY  add buildChatRequest + ChatInput (generateText/buildAiRequest untouched)
  chatClient.ts         CREATE  generateChat(settings, ChatInput) — multi-turn, one-shot per call
  assistant/
    types.ts            CREATE  ChatMessage, ProposedAction, AssistantContext, AssistantTaskStore, ActionResult
    contextBuilder.ts   CREATE  buildAssistantContext(state) -> AssistantContext
    actions.ts          CREATE  ACTION_REGISTRY (the extension point) + helpers
    systemPrompt.ts     CREATE  buildAssistantSystemPrompt(ctx) from registry + JSON contract
    responseParser.ts   CREATE  parseAssistantResponse(raw, ctx) -> { reply, actions }
    assistantRunner.ts  CREATE  runAssistantTurn(...) orchestration
src/stores/
  uiStore.ts            MODIFY  add ephemeral assistantOpen + toggleAssistant/openAssistant/closeAssistant
  assistantStore.ts     CREATE  messages[], status, send/applyAction/dismissAction/applyAll/regenerate/clear
src/hooks/
  useAssistantShortcut.ts CREATE in-app Cmd/Ctrl+J toggle
src/components/assistant/
  AssistantPanel.tsx    CREATE  floating trigger + Radix slide-over shell
  MessageList.tsx       CREATE
  MessageBubble.tsx     CREATE  reuses DebriefContent for assistant markdown
  ActionCard.tsx        CREATE  per-action Apply / Dismiss
  Composer.tsx          CREATE  textarea + send
  EmptyState.tsx        CREATE  starter chips + expectation line
src/App.tsx             MODIFY  mount <AssistantPanel/>; call useAssistantShortcut()
```

**Scope note:** The spec said "global shortcut". To avoid colliding with the existing OS-level global-shortcut registration in `useQuickAddShortcuts`, v1 uses an **in-app** keyboard shortcut (window keydown), same mechanism as the local quick-add listener. This is a deliberate, stated simplification.

---

## Task 1: Multi-turn request builder in providers

**Files:**
- Modify: `src/services/ai/providers.ts`
- Test: `src/services/ai/providers.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/services/ai/providers.test.ts`:

```ts
import { buildChatRequest, type ChatInput } from "./providers";

const chatInput: ChatInput = {
  system: "You are a planner.",
  messages: [
    { role: "user", content: "Plan my day" },
    { role: "assistant", content: "Sure" },
    { role: "user", content: "Add a task" }
  ]
};

describe("buildChatRequest", () => {
  it("anthropic: system top-level, messages mapped through", () => {
    const req = buildChatRequest(settings({ aiProvider: "anthropic" }), chatInput);
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.body.system).toBe("You are a planner.");
    expect(req.body.messages).toEqual(chatInput.messages);
    expect(req.headers["x-api-key"]).toBe("test-key");
  });

  it("openai: system injected as first message", () => {
    const req = buildChatRequest(settings({ aiProvider: "openai" }), chatInput);
    expect(req.url).toBe("https://api.openai.com/v1/chat/completions");
    const msgs = req.body.messages as Array<{ role: string; content: string }>;
    expect(msgs[0]).toEqual({ role: "system", content: "You are a planner." });
    expect(msgs).toHaveLength(4);
  });

  it("gemini: assistant role mapped to model, system as instruction", () => {
    const req = buildChatRequest(settings({ aiProvider: "gemini", aiModel: "gemini-2.5-flash" }), chatInput);
    expect(req.url).toContain("gemini-2.5-flash:generateContent");
    const contents = req.body.contents as Array<{ role: string }>;
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(req.body.systemInstruction).toEqual({ parts: [{ text: "You are a planner." }] });
  });

  it("custom: requires base url, posts to /chat/completions", () => {
    const req = buildChatRequest(
      settings({ aiProvider: "custom", aiBaseUrl: "http://localhost:11434/v1/" }),
      chatInput
    );
    expect(req.url).toBe("http://localhost:11434/v1/chat/completions");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/ai/providers.test.ts`
Expected: FAIL — `buildChatRequest`/`ChatInput` not exported.

- [ ] **Step 3: Implement in `src/services/ai/providers.ts`**

Add after the existing `GenerateInput` type:

```ts
export type ChatRole = "user" | "assistant";

export type ChatTurn = { role: ChatRole; content: string };

export type ChatInput = {
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
};
```

Add this function (place after `buildAiRequest`). Reuse `normalizeBaseUrl`, `resolveModel`, `DEFAULT_MAX_TOKENS` already in the file:

```ts
function buildOpenAiCompatibleChatRequest(
  baseUrl: string,
  settings: AiSettings,
  input: ChatInput
): AiRequest {
  return {
    url: `${normalizeBaseUrl(baseUrl)}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.aiApiKey}`
    },
    body: {
      model: resolveModel(settings),
      messages: [
        { role: "system", content: input.system },
        ...input.messages
      ],
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {})
    }
  };
}

export function buildChatRequest(settings: AiSettings, input: ChatInput): AiRequest {
  switch (settings.aiProvider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.aiApiKey,
          "anthropic-version": "2023-06-01"
        },
        body: {
          model: resolveModel(settings),
          max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: input.system,
          messages: input.messages,
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {})
        }
      };
    case "openai":
      return buildOpenAiCompatibleChatRequest("https://api.openai.com/v1", settings, input);
    case "gemini": {
      const model = resolveModel(settings);
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": settings.aiApiKey
        },
        body: {
          systemInstruction: { parts: [{ text: input.system }] },
          contents: input.messages.map((turn) => ({
            role: turn.role === "assistant" ? "model" : "user",
            parts: [{ text: turn.content }]
          })),
          ...(input.temperature !== undefined
            ? { generationConfig: { temperature: input.temperature } }
            : {})
        }
      };
    }
    case "custom": {
      if (normalizeBaseUrl(settings.aiBaseUrl).length === 0) {
        throw new Error("Custom provider needs a base URL (e.g. http://localhost:11434/v1)");
      }
      return buildOpenAiCompatibleChatRequest(settings.aiBaseUrl, settings, input);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/ai/providers.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/providers.ts src/services/ai/providers.test.ts
git commit -m "feat: multi-turn chat request builder for AI providers"
```

---

## Task 2: generateChat client

**Files:**
- Create: `src/services/ai/chatClient.ts`

No unit test (mirrors untested `aiClient.ts`; it is a thin wrapper over `fetch` + already-tested `buildChatRequest`/`parseAiResponse`, and is covered indirectly by the runner test in Task 8).

- [ ] **Step 1: Create `src/services/ai/chatClient.ts`**

```ts
import { fetch } from "@tauri-apps/plugin-http";
import { hasAiKey } from "./aiClient";
import {
  buildChatRequest,
  extractErrorMessage,
  parseAiResponse,
  type AiSettings,
  type ChatInput
} from "./providers";

/**
 * Multi-turn text generation against the configured provider. Like
 * `generateText`, but takes a full message history. One network round-trip per
 * call (no streaming). Goes through the Tauri HTTP plugin so provider APIs that
 * reject browser-origin requests still work.
 */
export async function generateChat(settings: AiSettings, input: ChatInput): Promise<string> {
  if (!hasAiKey(settings)) {
    throw new Error("Add an API key in Settings → AI to use the assistant");
  }

  const request = buildChatRequest(settings, input);

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body)
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach the AI provider: ${detail}`);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body; fall through to status handling below.
  }

  if (!response.ok) {
    const detail = extractErrorMessage(payload);
    if (response.status === 401 || response.status === 403) {
      throw new Error(detail ?? "The AI provider rejected your API key — check it in Settings → AI");
    }
    if (response.status === 429) {
      throw new Error(detail ?? "The AI provider is rate-limiting you — try again in a moment");
    }
    throw new Error(detail ?? `The AI provider returned an error (HTTP ${response.status})`);
  }

  return parseAiResponse(settings.aiProvider, payload);
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn build`
Expected: PASS (tsc has no errors for the new file).

- [ ] **Step 3: Commit**

```bash
git add src/services/ai/chatClient.ts
git commit -m "feat: generateChat multi-turn AI client"
```

---

## Task 3: Assistant shared types

**Files:**
- Create: `src/services/ai/assistant/types.ts`

No unit test (type-only module).

- [ ] **Step 1: Create `src/services/ai/assistant/types.ts`**

```ts
import type { CreateTaskInput, TaskPriority, TaskStatus } from "../../../types";

/** The six v1 capabilities. Extend here + add a registry entry in actions.ts. */
export type AssistantActionType =
  | "create_task"
  | "reschedule_task"
  | "move_to_backlog"
  | "drop_task"
  | "complete_task"
  | "start_task";

export type ActionResult = { ok: true } | { ok: false; message: string };

/** Minimal slice of taskStore an action may call. The real store satisfies it
 *  structurally, and tests can pass a mock. */
export interface AssistantTaskStore {
  createTask(input: CreateTaskInput): Promise<ActionResult>;
  rescheduleTask(taskId: string, dueDate: string): Promise<ActionResult>;
  moveTaskToBacklog(taskId: string): Promise<ActionResult>;
  dropTask(taskId: string): Promise<ActionResult>;
  completeTask(taskId: string, note?: string): Promise<ActionResult>;
  startTask(taskId: string): Promise<"started" | "failed">;
}

/** Compact task shape handed to the model so it can reference tasks by id. */
export type ContextTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedMinutes: number | null;
  categoryId: string | null;
};

export type AssistantContext = {
  today: string; // date key YYYY-MM-DD
  categories: { id: string; name: string }[];
  tasks: ContextTask[]; // today's tasks
  backlog: ContextTask[]; // capped slice of backlog
};

export type ChatRole = "user" | "assistant";

/** One proposed change, rendered as a confirm card. `params` is validated. */
export type ProposedAction = {
  id: string;
  type: AssistantActionType;
  params: unknown; // narrowed per-action; opaque at the store boundary
  summary: string; // human label from describe()
  destructive: boolean;
  status: "pending" | "applied" | "dismissed" | "failed";
  error?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string; // user text, or assistant reply (markdown)
  createdAt: string; // ISO
  actions?: ProposedAction[]; // assistant turns only
};

export type AssistantTurnResult = {
  reply: string;
  actions: ProposedAction[];
};
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/ai/assistant/types.ts
git commit -m "feat: assistant shared types"
```

---

## Task 4: Context builder

**Files:**
- Create: `src/services/ai/assistant/contextBuilder.ts`
- Test: `src/services/ai/assistant/contextBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildAssistantContext, type AssistantStoreSnapshot } from "./contextBuilder";
import type { Category, Task } from "../../../types";

function task(overrides: Partial<Task>): Task {
  return {
    id: "t1", title: "Write report", description: null, category_id: "c1",
    status: "todo", priority: "high", estimated_minutes: 60, due_date: "2026-06-18",
    template_id: null, planned_start_time: null, planned_end_time: null, sort_order: 0,
    created_at: "", updated_at: "", completed_at: null, dropped_at: null, ...overrides
  };
}
const cat: Category = { id: "c1", name: "Deep Work" } as Category;

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-18",
  tasks: [task({})],
  backlogTasks: [task({ id: "b1", title: "Backlog item", due_date: null })],
  categories: [cat]
};

describe("buildAssistantContext", () => {
  it("maps today's tasks and categories", () => {
    const ctx = buildAssistantContext(snapshot);
    expect(ctx.today).toBe("2026-06-18");
    expect(ctx.categories).toEqual([{ id: "c1", name: "Deep Work" }]);
    expect(ctx.tasks[0]).toMatchObject({ id: "t1", title: "Write report", estimatedMinutes: 60 });
  });

  it("caps backlog to 30 items", () => {
    const big = Array.from({ length: 50 }, (_, i) => task({ id: `b${i}`, due_date: null }));
    const ctx = buildAssistantContext({ ...snapshot, backlogTasks: big });
    expect(ctx.backlog).toHaveLength(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/ai/assistant/contextBuilder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/ai/assistant/contextBuilder.ts`**

```ts
import type { Category, Task } from "../../../types";
import type { AssistantContext, ContextTask } from "./types";

const BACKLOG_CAP = 30;

/** Just the fields the builder reads from taskStore — keeps it test-friendly. */
export type AssistantStoreSnapshot = {
  selectedDate: string;
  tasks: Task[];
  backlogTasks: Task[];
  categories: Category[];
};

function toContextTask(task: Task): ContextTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    estimatedMinutes: task.estimated_minutes,
    categoryId: task.category_id
  };
}

export function buildAssistantContext(snapshot: AssistantStoreSnapshot): AssistantContext {
  return {
    today: snapshot.selectedDate,
    categories: snapshot.categories.map((category) => ({ id: category.id, name: category.name })),
    tasks: snapshot.tasks.map(toContextTask),
    backlog: snapshot.backlogTasks.slice(0, BACKLOG_CAP).map(toContextTask)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/ai/assistant/contextBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/contextBuilder.ts src/services/ai/assistant/contextBuilder.test.ts
git commit -m "feat: assistant context builder"
```

---

## Task 5: Action registry (the extension point)

**Files:**
- Create: `src/services/ai/assistant/actions.ts`
- Test: `src/services/ai/assistant/actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { ACTION_REGISTRY, validateAction } from "./actions";
import type { AssistantContext, AssistantTaskStore } from "./types";

const ctx: AssistantContext = {
  today: "2026-06-18",
  categories: [{ id: "c1", name: "Deep Work" }],
  tasks: [
    { id: "t1", title: "Write report", status: "todo", priority: "high", estimatedMinutes: 60, categoryId: "c1" }
  ],
  backlog: [
    { id: "b1", title: "Backlog item", status: "todo", priority: "low", estimatedMinutes: null, categoryId: null }
  ]
};

describe("validateAction", () => {
  it("rejects unknown action types", () => {
    expect(validateAction({ type: "explode", title: "x" }, ctx)).toBeNull();
  });

  it("create_task: requires a title, resolves category by id or name", () => {
    const ok = validateAction({ type: "create_task", title: "New task", category: "Deep Work" }, ctx);
    expect(ok?.type).toBe("create_task");
    expect((ok?.params as { category_id: string | null }).category_id).toBe("c1");
    expect(validateAction({ type: "create_task", title: "  " }, ctx)).toBeNull();
  });

  it("create_task: maps 'today' due date to the context date", () => {
    const ok = validateAction({ type: "create_task", title: "T", due_date: "today" }, ctx);
    expect((ok?.params as { due_date: string | null }).due_date).toBe("2026-06-18");
  });

  it("reschedule_task: requires a known task id and a date", () => {
    expect(validateAction({ type: "reschedule_task", task_id: "nope", due_date: "2026-06-20" }, ctx)).toBeNull();
    const ok = validateAction({ type: "reschedule_task", task_id: "t1", due_date: "2026-06-20" }, ctx);
    expect(ok?.type).toBe("reschedule_task");
  });

  it("drop_task is marked destructive; complete/start are not", () => {
    expect(validateAction({ type: "drop_task", task_id: "t1" }, ctx)?.destructive).toBe(true);
    expect(validateAction({ type: "complete_task", task_id: "t1" }, ctx)?.destructive).toBe(false);
  });
});

describe("registry execute", () => {
  it("create_task calls store.createTask with validated input", async () => {
    const store: AssistantTaskStore = {
      createTask: vi.fn().mockResolvedValue({ ok: true }),
      rescheduleTask: vi.fn(), moveTaskToBacklog: vi.fn(),
      dropTask: vi.fn(), completeTask: vi.fn(), startTask: vi.fn()
    };
    const action = validateAction({ type: "create_task", title: "New task" }, ctx)!;
    const result = await ACTION_REGISTRY[action.type].execute(action.params, store);
    expect(result.ok).toBe(true);
    expect(store.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "New task" }));
  });

  it("start_task normalizes the string result to ActionResult", async () => {
    const store: AssistantTaskStore = {
      createTask: vi.fn(), rescheduleTask: vi.fn(), moveTaskToBacklog: vi.fn(),
      dropTask: vi.fn(), completeTask: vi.fn(),
      startTask: vi.fn().mockResolvedValue("failed")
    };
    const action = validateAction({ type: "start_task", task_id: "t1" }, ctx)!;
    const result = await ACTION_REGISTRY[action.type].execute(action.params, store);
    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/ai/assistant/actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/ai/assistant/actions.ts`**

```ts
import type { CreateTaskInput } from "../../../types";
import type {
  ActionResult,
  AssistantActionType,
  AssistantContext,
  AssistantTaskStore,
  ProposedAction
} from "./types";

/** Prompt fragment so the model knows when/how to emit an action. */
type PromptSpec = { name: string; when: string; params: string };

type ActionDescriptor<P> = {
  type: AssistantActionType;
  destructive: boolean;
  promptSpec: PromptSpec;
  /** Validate raw LLM params; return typed params or throw with a reason. */
  validate: (raw: Record<string, unknown>, ctx: AssistantContext) => P;
  describe: (params: P, ctx: AssistantContext) => string;
  execute: (params: P, store: AssistantTaskStore) => Promise<ActionResult>;
};

// ── validation helpers ───────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`"${key}" must be a non-empty string`);
  }
  return value.trim();
}

function knownTaskId(raw: Record<string, unknown>, ctx: AssistantContext): string {
  const id = str(raw, "task_id");
  const exists = [...ctx.tasks, ...ctx.backlog].some((task) => task.id === id);
  if (!exists) {
    throw new Error(`task_id "${id}" is not a known task`);
  }
  return id;
}

function titleOf(id: string, ctx: AssistantContext): string {
  return [...ctx.tasks, ...ctx.backlog].find((task) => task.id === id)?.title ?? id;
}

/** Resolve an optional category reference (id OR name) to a real id or null. */
function resolveCategory(raw: Record<string, unknown>, ctx: AssistantContext): string | null {
  const value = raw.category;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const needle = value.trim().toLowerCase();
  const match = ctx.categories.find(
    (category) => category.id.toLowerCase() === needle || category.name.toLowerCase() === needle
  );
  return match ? match.id : null;
}

function resolveDueDate(raw: Record<string, unknown>, ctx: AssistantContext): string | null {
  const value = raw.due_date;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "today") return ctx.today;
  if (DATE_RE.test(value.trim())) return value.trim();
  throw new Error(`due_date "${value}" must be YYYY-MM-DD or "today"`);
}

function requiredDate(raw: Record<string, unknown>, ctx: AssistantContext): string {
  const resolved = resolveDueDate(raw, ctx);
  if (!resolved) throw new Error('"due_date" is required (YYYY-MM-DD or "today")');
  return resolved;
}

// ── action descriptors ───────────────────────────────────────────────────────

type CreateParams = CreateTaskInput;
type TaskIdParams = { task_id: string; title: string };
type RescheduleParams = { task_id: string; title: string; due_date: string };

const createTask: ActionDescriptor<CreateParams> = {
  type: "create_task",
  destructive: false,
  promptSpec: {
    name: "create_task",
    when: "the user wants a new task added",
    params: 'title (required), category (optional, a category name), priority ("low"|"medium"|"high", optional), estimated_minutes (number, optional), due_date ("today"|YYYY-MM-DD, optional — omit to put it in the backlog)'
  },
  validate: (raw, ctx) => {
    const priorityRaw = raw.priority;
    const priority =
      priorityRaw === "low" || priorityRaw === "medium" || priorityRaw === "high" ? priorityRaw : undefined;
    const estimate = typeof raw.estimated_minutes === "number" && raw.estimated_minutes > 0
      ? raw.estimated_minutes : null;
    return {
      title: str(raw, "title"),
      category_id: resolveCategory(raw, ctx),
      priority,
      estimated_minutes: estimate,
      due_date: resolveDueDate(raw, ctx)
    };
  },
  describe: (params) =>
    `Create task "${params.title}"${params.due_date ? ` for ${params.due_date}` : " in backlog"}`,
  execute: (params, store) => store.createTask(params)
};

const rescheduleTask: ActionDescriptor<RescheduleParams> = {
  type: "reschedule_task",
  destructive: false,
  promptSpec: {
    name: "reschedule_task",
    when: "the user wants an existing task moved to a different day",
    params: 'task_id (required), due_date (required, "today"|YYYY-MM-DD)'
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    return { task_id: id, title: titleOf(id, ctx), due_date: requiredDate(raw, ctx) };
  },
  describe: (params) => `Move "${params.title}" to ${params.due_date}`,
  execute: (params, store) => store.rescheduleTask(params.task_id, params.due_date)
};

const moveToBacklog: ActionDescriptor<TaskIdParams> = {
  type: "move_to_backlog",
  destructive: false,
  promptSpec: {
    name: "move_to_backlog",
    when: "the user wants a scheduled task moved off the calendar into the backlog",
    params: "task_id (required)"
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    return { task_id: id, title: titleOf(id, ctx) };
  },
  describe: (params) => `Move "${params.title}" to backlog`,
  execute: (params, store) => store.moveTaskToBacklog(params.task_id)
};

const dropTask: ActionDescriptor<TaskIdParams> = {
  type: "drop_task",
  destructive: true,
  promptSpec: {
    name: "drop_task",
    when: "the user wants to abandon/cancel a task",
    params: "task_id (required)"
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    return { task_id: id, title: titleOf(id, ctx) };
  },
  describe: (params) => `Drop "${params.title}"`,
  execute: (params, store) => store.dropTask(params.task_id)
};

const completeTask: ActionDescriptor<TaskIdParams> = {
  type: "complete_task",
  destructive: false,
  promptSpec: {
    name: "complete_task",
    when: "the user says a task is finished",
    params: "task_id (required)"
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    return { task_id: id, title: titleOf(id, ctx) };
  },
  describe: (params) => `Mark "${params.title}" done`,
  execute: (params, store) => store.completeTask(params.task_id)
};

const startTask: ActionDescriptor<TaskIdParams> = {
  type: "start_task",
  destructive: false,
  promptSpec: {
    name: "start_task",
    when: "the user wants to start focusing on a task right now",
    params: "task_id (required)"
  },
  validate: (raw, ctx) => {
    const id = knownTaskId(raw, ctx);
    return { task_id: id, title: titleOf(id, ctx) };
  },
  describe: (params) => `Start focus on "${params.title}"`,
  execute: async (params, store) => {
    const result = await store.startTask(params.task_id);
    return result === "started"
      ? { ok: true }
      : { ok: false, message: "Could not start the task (another may be running)" };
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ACTION_REGISTRY: Record<AssistantActionType, ActionDescriptor<any>> = {
  create_task: createTask,
  reschedule_task: rescheduleTask,
  move_to_backlog: moveToBacklog,
  drop_task: dropTask,
  complete_task: completeTask,
  start_task: startTask
};

export const ACTION_TYPES = Object.keys(ACTION_REGISTRY) as AssistantActionType[];

export function actionPromptSpecs(): PromptSpec[] {
  return ACTION_TYPES.map((type) => ACTION_REGISTRY[type].promptSpec);
}

let actionCounter = 0;

/**
 * Validate one raw action object from the model. Returns a ProposedAction
 * (status "pending") or null if the type is unknown or params are invalid —
 * invalid actions are dropped, never thrown, so one bad action can't sink a turn.
 */
export function validateAction(
  raw: unknown,
  ctx: AssistantContext
): ProposedAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string" || !(type in ACTION_REGISTRY)) return null;
  const descriptor = ACTION_REGISTRY[type as AssistantActionType];
  try {
    const params = descriptor.validate(record, ctx);
    actionCounter += 1;
    return {
      id: `act_${Date.now().toString(36)}_${actionCounter}`,
      type: descriptor.type,
      params,
      summary: descriptor.describe(params, ctx),
      destructive: descriptor.destructive,
      status: "pending"
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/ai/assistant/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/actions.ts src/services/ai/assistant/actions.test.ts
git commit -m "feat: assistant action registry with validation"
```

---

## Task 6: System prompt builder

**Files:**
- Create: `src/services/ai/assistant/systemPrompt.ts`
- Test: `src/services/ai/assistant/systemPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import type { AssistantContext } from "./types";

const ctx: AssistantContext = {
  today: "2026-06-18",
  categories: [{ id: "c1", name: "Deep Work" }],
  tasks: [
    { id: "t1", title: "Write report", status: "todo", priority: "high", estimatedMinutes: 60, categoryId: "c1" }
  ],
  backlog: []
};

describe("buildAssistantSystemPrompt", () => {
  it("includes persona, JSON contract, every action name, and the context", () => {
    const prompt = buildAssistantSystemPrompt(ctx);
    expect(prompt).toContain("Yolo");
    expect(prompt).toContain('"reply"');
    expect(prompt).toContain('"actions"');
    expect(prompt).toContain("create_task");
    expect(prompt).toContain("reschedule_task");
    expect(prompt).toContain("Write report");
    expect(prompt).toContain("2026-06-18");
    expect(prompt).toContain("t1");
  });

  it("notes when there are no tasks", () => {
    const prompt = buildAssistantSystemPrompt({ ...ctx, tasks: [] });
    expect(prompt.toLowerCase()).toContain("no tasks");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/ai/assistant/systemPrompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/ai/assistant/systemPrompt.ts`**

```ts
import { actionPromptSpecs } from "./actions";
import type { AssistantContext, ContextTask } from "./types";

function describeTask(task: ContextTask): string {
  const estimate = task.estimatedMinutes ? `, est ${task.estimatedMinutes}m` : "";
  return `- [${task.id}] "${task.title}" (${task.status}, ${task.priority}${estimate})`;
}

function renderContext(ctx: AssistantContext): string {
  const lines: string[] = [`Today's date: ${ctx.today}`];

  lines.push(
    ctx.categories.length > 0
      ? `Categories: ${ctx.categories.map((c) => `${c.name} [${c.id}]`).join(", ")}`
      : "Categories: none"
  );

  lines.push(
    ctx.tasks.length > 0
      ? ["Today's tasks:", ...ctx.tasks.map(describeTask)].join("\n")
      : "Today's tasks: none — the user has no tasks scheduled today."
  );

  if (ctx.backlog.length > 0) {
    lines.push(["Backlog (unscheduled):", ...ctx.backlog.map(describeTask)].join("\n"));
  }

  return lines.join("\n");
}

function renderActionCatalog(): string {
  return actionPromptSpecs()
    .map((spec) => `- ${spec.name}: use when ${spec.when}. params: ${spec.params}`)
    .join("\n");
}

export function buildAssistantSystemPrompt(ctx: AssistantContext): string {
  return [
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
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/ai/assistant/systemPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/systemPrompt.ts src/services/ai/assistant/systemPrompt.test.ts
git commit -m "feat: assistant system prompt from action registry"
```

---

## Task 7: Response parser

**Files:**
- Create: `src/services/ai/assistant/responseParser.ts`
- Test: `src/services/ai/assistant/responseParser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseAssistantResponse } from "./responseParser";
import type { AssistantContext } from "./types";

const ctx: AssistantContext = {
  today: "2026-06-18",
  categories: [{ id: "c1", name: "Deep Work" }],
  tasks: [
    { id: "t1", title: "Write report", status: "todo", priority: "high", estimatedMinutes: 60, categoryId: "c1" }
  ],
  backlog: []
};

describe("parseAssistantResponse", () => {
  it("parses reply and valid actions", () => {
    const raw = JSON.stringify({
      reply: "Here's a plan.",
      actions: [{ type: "create_task", title: "Draft outline", due_date: "today" }]
    });
    const result = parseAssistantResponse(raw, ctx);
    expect(result.reply).toBe("Here's a plan.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].summary).toContain("Draft outline");
  });

  it("tolerates code fences around the JSON", () => {
    const raw = "```json\n{ \"reply\": \"hi\", \"actions\": [] }\n```";
    expect(parseAssistantResponse(raw, ctx).reply).toBe("hi");
  });

  it("drops invalid/unknown actions but keeps the reply", () => {
    const raw = JSON.stringify({
      reply: "ok",
      actions: [
        { type: "create_task", title: "Good" },
        { type: "explode_sun" },
        { type: "reschedule_task", task_id: "does-not-exist", due_date: "today" }
      ]
    });
    const result = parseAssistantResponse(raw, ctx);
    expect(result.actions).toHaveLength(1);
  });

  it("falls back to raw text as the reply when JSON is unparseable", () => {
    const result = parseAssistantResponse("Sorry, I cannot do that.", ctx);
    expect(result.reply).toBe("Sorry, I cannot do that.");
    expect(result.actions).toEqual([]);
  });

  it("defaults a missing actions field to an empty array", () => {
    const result = parseAssistantResponse(JSON.stringify({ reply: "hello" }), ctx);
    expect(result.actions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/ai/assistant/responseParser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/ai/assistant/responseParser.ts`**

```ts
import { validateAction } from "./actions";
import type { AssistantContext, AssistantTurnResult, ProposedAction } from "./types";

/** Pull the outermost JSON object out of a model reply, tolerating code fences
 *  or stray prose around it. Returns null if no object-looking span is found. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

export function parseAssistantResponse(raw: string, ctx: AssistantContext): AssistantTurnResult {
  const candidate = extractJsonObject(raw);

  let parsed: unknown = null;
  if (candidate) {
    try {
      parsed = JSON.parse(candidate);
    } catch {
      parsed = null;
    }
  }

  // Unparseable → treat the whole text as a plain reply with no actions.
  if (typeof parsed !== "object" || parsed === null) {
    return { reply: raw.trim(), actions: [] };
  }

  const record = parsed as Record<string, unknown>;
  const reply = typeof record.reply === "string" && record.reply.trim().length > 0
    ? record.reply.trim()
    : raw.trim();

  const rawActions = Array.isArray(record.actions) ? record.actions : [];
  const actions = rawActions
    .map((entry) => validateAction(entry, ctx))
    .filter((entry): entry is ProposedAction => entry !== null);

  return { reply, actions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/ai/assistant/responseParser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/responseParser.ts src/services/ai/assistant/responseParser.test.ts
git commit -m "feat: assistant response parser"
```

---

## Task 8: Assistant runner (orchestration)

**Files:**
- Create: `src/services/ai/assistant/assistantRunner.ts`
- Test: `src/services/ai/assistant/assistantRunner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { runAssistantTurn } from "./assistantRunner";
import type { AssistantStoreSnapshot } from "./contextBuilder";
import type { ChatTurn } from "../providers";

const snapshot: AssistantStoreSnapshot = {
  selectedDate: "2026-06-18",
  tasks: [],
  backlogTasks: [],
  categories: [{ id: "c1", name: "Deep Work" } as never]
};

const settings = { aiProvider: "anthropic" as const, aiApiKey: "k", aiModel: "", aiBaseUrl: "" };

describe("runAssistantTurn", () => {
  it("builds context, calls generateChat with system + messages, parses result", async () => {
    const generateChat = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ reply: "Done", actions: [] }));
    const messages: ChatTurn[] = [{ role: "user", content: "hi" }];

    const result = await runAssistantTurn(
      { settings, snapshot, messages },
      { generateChat }
    );

    expect(generateChat).toHaveBeenCalledTimes(1);
    const callArg = generateChat.mock.calls[0][1];
    expect(callArg.system).toContain("Yolo Assistant");
    expect(callArg.messages).toEqual(messages);
    expect(result.reply).toBe("Done");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/ai/assistant/assistantRunner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/ai/assistant/assistantRunner.ts`**

```ts
import { generateChat as defaultGenerateChat } from "../chatClient";
import type { AiSettings, ChatInput, ChatTurn } from "../providers";
import { buildAssistantContext, type AssistantStoreSnapshot } from "./contextBuilder";
import { parseAssistantResponse } from "./responseParser";
import { buildAssistantSystemPrompt } from "./systemPrompt";
import type { AssistantTurnResult } from "./types";

/** Low temperature keeps proposals consistent for the same day state. */
const ASSISTANT_TEMPERATURE = 0.3;

export type RunAssistantTurnInput = {
  settings: AiSettings;
  snapshot: AssistantStoreSnapshot;
  messages: ChatTurn[]; // full conversation history, oldest first, last = newest user turn
};

/** Injected for tests; defaults to the real network client. */
export type AssistantRunnerDeps = {
  generateChat: (settings: AiSettings, input: ChatInput) => Promise<string>;
};

export async function runAssistantTurn(
  input: RunAssistantTurnInput,
  deps: AssistantRunnerDeps = { generateChat: defaultGenerateChat }
): Promise<AssistantTurnResult> {
  const ctx = buildAssistantContext(input.snapshot);
  const system = buildAssistantSystemPrompt(ctx);
  const raw = await deps.generateChat(input.settings, {
    system,
    messages: input.messages,
    temperature: ASSISTANT_TEMPERATURE
  });
  return parseAssistantResponse(raw, ctx);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/ai/assistant/assistantRunner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/assistantRunner.ts src/services/ai/assistant/assistantRunner.test.ts
git commit -m "feat: assistant turn orchestration"
```

---

## Task 9: uiStore — assistant open state

**Files:**
- Modify: `src/stores/uiStore.ts`
- Test: `src/stores/uiStore.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/stores/uiStore.test.ts`:

```ts
import { useUiStore } from "./uiStore";

describe("assistant panel state", () => {
  it("toggles and sets assistant open (ephemeral, defaults closed)", () => {
    expect(useUiStore.getState().assistantOpen).toBe(false);
    useUiStore.getState().toggleAssistant();
    expect(useUiStore.getState().assistantOpen).toBe(true);
    useUiStore.getState().closeAssistant();
    expect(useUiStore.getState().assistantOpen).toBe(false);
    useUiStore.getState().openAssistant();
    expect(useUiStore.getState().assistantOpen).toBe(true);
    useUiStore.getState().closeAssistant();
  });
});
```

(If `uiStore.test.ts` lacks `describe`/`it`/`expect` imports, add `import { describe, expect, it } from "vitest";` at the top.)

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/stores/uiStore.test.ts`
Expected: FAIL — `assistantOpen` undefined / `toggleAssistant` not a function.

- [ ] **Step 3: Implement in `src/stores/uiStore.ts`**

In the `UiState` type, next to the `focusZen` block, add:

```ts
  // Yolo Assistant slide-over. Ephemeral (not persisted): reopening the app
  // should never start with the assistant open.
  assistantOpen: boolean;
  openAssistant: () => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
```

In the store implementation, next to the `focusZen` block, add:

```ts
  assistantOpen: false,
  openAssistant: () => set({ assistantOpen: true }),
  closeAssistant: () => set({ assistantOpen: false }),
  toggleAssistant: () => set((state) => ({ assistantOpen: !state.assistantOpen })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/stores/uiStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/uiStore.ts src/stores/uiStore.test.ts
git commit -m "feat: assistant panel open state in uiStore"
```

---

## Task 10: assistantStore (conversation + apply)

**Files:**
- Create: `src/stores/assistantStore.ts`
- Test: `src/stores/assistantStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const runAssistantTurn = vi.fn();
vi.mock("../services/ai/assistant/assistantRunner", () => ({ runAssistantTurn }));

const taskState = {
  selectedDate: "2026-06-18",
  tasks: [],
  backlogTasks: [],
  categories: [],
  createTask: vi.fn().mockResolvedValue({ ok: true }),
  rescheduleTask: vi.fn(), moveTaskToBacklog: vi.fn(), dropTask: vi.fn(),
  completeTask: vi.fn(), startTask: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined)
};
vi.mock("./taskStore", () => ({ useTaskStore: { getState: () => taskState } }));

const uiState = {
  addToast: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true)
};
vi.mock("./uiStore", () => ({ useUiStore: { getState: () => uiState } }));

vi.mock("./settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ settings: { aiProvider: "anthropic", aiApiKey: "k", aiModel: "", aiBaseUrl: "" } })
  }
}));

import { useAssistantStore } from "./assistantStore";

beforeEach(() => {
  useAssistantStore.setState({ messages: [], status: "idle", error: null });
  vi.clearAllMocks();
  taskState.createTask.mockResolvedValue({ ok: true });
  uiState.confirm.mockResolvedValue(true);
});

describe("assistantStore.send", () => {
  it("appends user + assistant messages with proposed actions", async () => {
    runAssistantTurn.mockResolvedValue({
      reply: "Here's a plan",
      actions: [{ id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "pending" }]
    });
    await useAssistantStore.getState().send("plan my day");
    const messages = useAssistantStore.getState().messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1].actions?.[0].summary).toBe("Create X");
    expect(useAssistantStore.getState().status).toBe("idle");
  });

  it("records an error when the runner throws", async () => {
    runAssistantTurn.mockRejectedValue(new Error("no key"));
    await useAssistantStore.getState().send("hi");
    expect(useAssistantStore.getState().status).toBe("error");
    expect(useAssistantStore.getState().error).toContain("no key");
  });
});

describe("assistantStore.applyAction", () => {
  it("executes the action and marks it applied, refreshing tasks", async () => {
    runAssistantTurn.mockResolvedValue({
      reply: "ok",
      actions: [{ id: "a1", type: "create_task", params: { title: "X" }, summary: "Create X", destructive: false, status: "pending" }]
    });
    await useAssistantStore.getState().send("add X");
    const msg = useAssistantStore.getState().messages[1];
    await useAssistantStore.getState().applyAction(msg.id, "a1");
    expect(taskState.createTask).toHaveBeenCalledWith({ title: "X" });
    expect(taskState.refresh).toHaveBeenCalled();
    const applied = useAssistantStore.getState().messages[1].actions?.[0];
    expect(applied?.status).toBe("applied");
  });

  it("confirms before a destructive action and marks failed on error", async () => {
    taskState.dropTask = vi.fn().mockResolvedValue({ ok: false, message: "nope" });
    runAssistantTurn.mockResolvedValue({
      reply: "ok",
      actions: [{ id: "d1", type: "drop_task", params: { task_id: "t1", title: "T" }, summary: "Drop T", destructive: true, status: "pending" }]
    });
    await useAssistantStore.getState().send("drop it");
    const msg = useAssistantStore.getState().messages[1];
    await useAssistantStore.getState().applyAction(msg.id, "d1");
    expect(uiState.confirm).toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[1].actions?.[0].status).toBe("failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/stores/assistantStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/stores/assistantStore.ts`**

```ts
import { create } from "zustand";
import { ACTION_REGISTRY } from "../services/ai/assistant/actions";
import { runAssistantTurn } from "../services/ai/assistant/assistantRunner";
import type { AssistantStoreSnapshot } from "../services/ai/assistant/contextBuilder";
import type { ChatMessage, ProposedAction } from "../services/ai/assistant/types";
import type { ChatTurn } from "../services/ai/providers";
import { createId } from "../utils/id";
import { useSettingsStore } from "./settingsStore";
import { useTaskStore } from "./taskStore";
import { useUiStore } from "./uiStore";

export type AssistantStatus = "idle" | "thinking" | "error";

type AssistantState = {
  messages: ChatMessage[];
  status: AssistantStatus;
  error: string | null;
  send: (text: string) => Promise<void>;
  applyAction: (messageId: string, actionId: string) => Promise<void>;
  dismissAction: (messageId: string, actionId: string) => void;
  clear: () => void;
};

function snapshot(): AssistantStoreSnapshot {
  const state = useTaskStore.getState();
  return {
    selectedDate: state.selectedDate,
    tasks: state.tasks,
    backlogTasks: state.backlogTasks,
    categories: state.categories
  };
}

function toChatTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

/** Immutably replace one action inside one message. */
function patchAction(
  messages: ChatMessage[],
  messageId: string,
  actionId: string,
  patch: Partial<ProposedAction>
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== messageId || !message.actions) return message;
    return {
      ...message,
      actions: message.actions.map((action) =>
        action.id === actionId ? { ...action, ...patch } : action
      )
    };
  });
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  messages: [],
  status: "idle",
  error: null,

  send: async (text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || get().status === "thinking") return;

    const userMessage: ChatMessage = {
      id: createId("msg"),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString()
    };
    const history = [...get().messages, userMessage];
    set({ messages: history, status: "thinking", error: null });

    try {
      const result = await runAssistantTurn({
        settings: useSettingsStore.getState().settings,
        snapshot: snapshot(),
        messages: toChatTurns(history)
      });
      const assistantMessage: ChatMessage = {
        id: createId("msg"),
        role: "assistant",
        content: result.reply,
        createdAt: new Date().toISOString(),
        actions: result.actions
      };
      set({ messages: [...history, assistantMessage], status: "idle" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The assistant ran into a problem";
      set({ status: "error", error: message });
      useUiStore.getState().addToast({ kind: "error", title: "Assistant error", description: message });
    }
  },

  applyAction: async (messageId, actionId) => {
    const message = get().messages.find((entry) => entry.id === messageId);
    const action = message?.actions?.find((entry) => entry.id === actionId);
    if (!action || action.status !== "pending") return;

    if (action.destructive) {
      const confirmed = await useUiStore.getState().confirm({
        message: `${action.summary}?`,
        confirmLabel: "Apply",
        danger: true
      });
      if (!confirmed) return;
    }

    const descriptor = ACTION_REGISTRY[action.type];
    const result = await descriptor.execute(action.params, useTaskStore.getState());

    if (result.ok) {
      await useTaskStore.getState().refresh();
      set({ messages: patchAction(get().messages, messageId, actionId, { status: "applied" }) });
    } else {
      set({ messages: patchAction(get().messages, messageId, actionId, { status: "failed", error: result.message }) });
      useUiStore.getState().addToast({ kind: "error", title: "Could not apply", description: result.message });
    }
  },

  dismissAction: (messageId, actionId) => {
    set({ messages: patchAction(get().messages, messageId, actionId, { status: "dismissed" }) });
  },

  clear: () => set({ messages: [], status: "idle", error: null })
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/stores/assistantStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/assistantStore.ts src/stores/assistantStore.test.ts
git commit -m "feat: assistant conversation store"
```

---

## Task 11: ActionCard component

**Files:**
- Create: `src/components/assistant/ActionCard.tsx`

UI components are verified via `yarn build` (no render tests in this codebase for similar components).

- [ ] **Step 1: Create `src/components/assistant/ActionCard.tsx`**

```tsx
import { Check, Plus, Play, CalendarClock, Inbox, Trash2, X } from "lucide-react";
import type { ComponentType } from "react";
import type { AssistantActionType, ProposedAction } from "../../services/ai/assistant/types";
import { Button } from "../ui/Button";

const ICONS: Record<AssistantActionType, ComponentType<{ className?: string }>> = {
  create_task: Plus,
  reschedule_task: CalendarClock,
  move_to_backlog: Inbox,
  drop_task: Trash2,
  complete_task: Check,
  start_task: Play
};

type ActionCardProps = {
  action: ProposedAction;
  onApply: () => void;
  onDismiss: () => void;
};

export function ActionCard({ action, onApply, onDismiss }: ActionCardProps) {
  const Icon = ICONS[action.type];
  const settled = action.status !== "pending";

  return (
    <div
      className={
        "flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm " +
        (action.status === "applied" ? "opacity-70" : "")
      }
    >
      <Icon
        className={
          "h-4 w-4 shrink-0 " + (action.destructive ? "text-destructive" : "text-primary")
        }
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-foreground">{action.summary}</p>
        {action.status === "failed" && action.error ? (
          <p className="truncate text-xs text-destructive">{action.error}</p>
        ) : null}
      </div>

      {action.status === "pending" ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant={action.destructive ? "danger" : "primary"} onClick={onApply}>
            Apply
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-xs capitalize text-muted-foreground">{action.status}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify Button variants/sizes exist**

Run: `yarn build`
Expected: PASS. If tsc reports a `variant`/`size` mismatch, open `src/components/ui/Button.tsx` and use the actual variant names (e.g. `primary`/`secondary`/`ghost`/`danger`) and sizes; adjust the two `<Button>` calls accordingly.

- [ ] **Step 3: Commit**

```bash
git add src/components/assistant/ActionCard.tsx
git commit -m "feat: assistant action card"
```

---

## Task 12: MessageBubble component

**Files:**
- Create: `src/components/assistant/MessageBubble.tsx`

- [ ] **Step 1: Create `src/components/assistant/MessageBubble.tsx`**

```tsx
import { useAssistantStore } from "../../stores/assistantStore";
import type { ChatMessage } from "../../services/ai/assistant/types";
import { DebriefContent } from "../myday/DebriefContent";
import { ActionCard } from "./ActionCard";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const applyAction = useAssistantStore((state) => state.applyAction);
  const dismissAction = useAssistantStore((state) => state.dismissAction);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-foreground">
        <DebriefContent content={message.content} />
      </div>
      {message.actions && message.actions.length > 0 ? (
        <div className="flex flex-col gap-1.5 pl-1">
          {message.actions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onApply={() => void applyAction(message.id, action.id)}
              onDismiss={() => dismissAction(message.id, action.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn build`
Expected: PASS. If `text-primary-foreground` or `bg-muted` are not defined tokens, substitute the nearest existing tokens (check `tailwind.config` / `src/styles.css`); the debrief/today components use `text-foreground`, `bg-card`, `text-muted-foreground`.

- [ ] **Step 3: Commit**

```bash
git add src/components/assistant/MessageBubble.tsx
git commit -m "feat: assistant message bubble"
```

---

## Task 13: EmptyState component

**Files:**
- Create: `src/components/assistant/EmptyState.tsx`

- [ ] **Step 1: Create `src/components/assistant/EmptyState.tsx`**

```tsx
import { Sparkles } from "lucide-react";

const STARTERS = [
  "Plan my day",
  "What should I focus on?",
  "Reschedule what I didn't finish to tomorrow"
];

export function AssistantEmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Yolo Assistant</p>
        <p className="text-xs text-muted-foreground">
          Ask me to plan or adjust your day. I suggest changes — you approve them.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onPick(starter)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/assistant/EmptyState.tsx
git commit -m "feat: assistant empty state with starters"
```

---

## Task 14: Composer component

**Files:**
- Create: `src/components/assistant/Composer.tsx`

- [ ] **Step 1: Create `src/components/assistant/Composer.tsx`**

```tsx
import { SendHorizonal } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useAssistantStore } from "../../stores/assistantStore";
import { IconButton } from "../ui/IconButton";

export function Composer() {
  const [value, setValue] = useState("");
  const send = useAssistantStore((state) => state.send);
  const status = useAssistantStore((state) => state.status);
  const thinking = status === "thinking";

  function submit() {
    const text = value.trim();
    if (text.length === 0 || thinking) return;
    setValue("");
    void send(text);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border p-3">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={thinking ? "Thinking…" : "Ask the assistant…"}
        disabled={thinking}
        className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-60"
      />
      <IconButton
        type="submit"
        icon={SendHorizonal}
        label="Send"
        variant="secondary"
        disabled={thinking || value.trim().length === 0}
      />
    </form>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn build`
Expected: PASS. If `IconButton` does not accept a `disabled` prop, confirm it spreads `...props` to the `<button>` (it does per `src/components/ui/IconButton.tsx`); otherwise wrap in a `<Button>`.

- [ ] **Step 3: Commit**

```bash
git add src/components/assistant/Composer.tsx
git commit -m "feat: assistant composer"
```

---

## Task 15: MessageList component

**Files:**
- Create: `src/components/assistant/MessageList.tsx`

- [ ] **Step 1: Create `src/components/assistant/MessageList.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { useAssistantStore } from "../../stores/assistantStore";
import { AssistantEmptyState } from "./EmptyState";
import { MessageBubble } from "./MessageBubble";

export function MessageList() {
  const messages = useAssistantStore((state) => state.messages);
  const status = useAssistantStore((state) => state.status);
  const send = useAssistantStore((state) => state.send);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  if (messages.length === 0) {
    return <AssistantEmptyState onPick={(text) => void send(text)} />;
  }

  return (
    <div className="flex-1 space-y-4 overflow-auto p-4" aria-live="polite">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {status === "thinking" ? (
        <div className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
          Thinking…
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/assistant/MessageList.tsx
git commit -m "feat: assistant message list"
```

---

## Task 16: AssistantPanel (trigger + slide-over)

**Files:**
- Create: `src/components/assistant/AssistantPanel.tsx`

Uses Radix Dialog (already a dependency) for focus-trap + Esc, framer-motion for the slide.

- [ ] **Step 1: Create `src/components/assistant/AssistantPanel.tsx`**

```tsx
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Eraser, Sparkles, X } from "lucide-react";
import { useAssistantStore } from "../../stores/assistantStore";
import { useUiStore } from "../../stores/uiStore";
import { IconButton } from "../ui/IconButton";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

export function AssistantPanel() {
  const open = useUiStore((state) => state.assistantOpen);
  const setOpen = useUiStore((state) => state.assistantOpen ? state.closeAssistant : state.openAssistant);
  const toggle = useUiStore((state) => state.toggleAssistant);
  const close = useUiStore((state) => state.closeAssistant);
  const clear = useAssistantStore((state) => state.clear);
  const hasMessages = useAssistantStore((state) => state.messages.length > 0);

  return (
    <>
      {/* Floating trigger — bottom-right, above content, hidden while open. */}
      {!open ? (
        <button
          type="button"
          onClick={toggle}
          aria-label="Open assistant"
          className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      ) : null}

      <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen() : close())}>
        <AnimatePresence>
          {open ? (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-40 bg-black/20"
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  className="fixed bottom-0 right-0 top-0 z-50 flex w-[420px] max-w-[92vw] flex-col border-l border-border bg-background shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <Dialog.Title className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Assistant
                    </Dialog.Title>
                    <div className="flex items-center gap-1">
                      {hasMessages ? (
                        <IconButton icon={Eraser} label="Clear conversation" variant="ghost" size="sm" onClick={clear} />
                      ) : null}
                      <Dialog.Close asChild>
                        <IconButton icon={X} label="Close assistant" variant="ghost" size="sm" />
                      </Dialog.Close>
                    </div>
                  </div>
                  <MessageList />
                  <Composer />
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          ) : null}
        </AnimatePresence>
      </Dialog.Root>
    </>
  );
}
```

- [ ] **Step 2: Verify it typechecks and builds**

Run: `yarn build`
Expected: PASS. If `text-primary-foreground`/`bg-background` tokens are missing, substitute existing ones used elsewhere (grep `bg-background` in `src/components` to confirm; the app shell uses these tokens, so they should exist).

- [ ] **Step 3: Commit**

```bash
git add src/components/assistant/AssistantPanel.tsx
git commit -m "feat: assistant slide-over panel"
```

---

## Task 17: In-app keyboard shortcut

**Files:**
- Create: `src/hooks/useAssistantShortcut.ts`

- [ ] **Step 1: Create `src/hooks/useAssistantShortcut.ts`**

```ts
import { useEffect } from "react";
import { useUiStore } from "../stores/uiStore";

/**
 * Toggle the assistant with Cmd/Ctrl+J. In-app only (a window keydown
 * listener) — intentionally not an OS-level global shortcut, to avoid
 * colliding with the quick-add global shortcut registration.
 */
export function useAssistantShortcut() {
  const toggleAssistant = useUiStore((state) => state.toggleAssistant);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggleAssistant();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleAssistant]);
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAssistantShortcut.ts
git commit -m "feat: assistant keyboard shortcut hook"
```

---

## Task 18: Wire into App

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

Near the other component imports in `src/App.tsx`:

```tsx
import { AssistantPanel } from "./components/assistant/AssistantPanel";
```

Near the other hook imports:

```tsx
import { useAssistantShortcut } from "./hooks/useAssistantShortcut";
```

- [ ] **Step 2: Call the shortcut hook**

In the `App` component body, alongside the other hook calls (`useDayRollover();` etc.), add:

```tsx
  useAssistantShortcut();
```

- [ ] **Step 3: Mount the panel**

In the returned JSX, next to the other global overlays (`<QuickAddDialog />`, `<ConfirmDialog />`, `<ToastViewport />`), add:

```tsx
      <AssistantPanel />
```

- [ ] **Step 4: Verify build**

Run: `yarn build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount assistant panel and shortcut in app"
```

---

## Task 19: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `yarn test`
Expected: PASS — all new and existing tests green.

- [ ] **Step 2: Run the production build**

Run: `yarn build`
Expected: PASS — tsc + vite with no errors.

- [ ] **Step 3: Manual smoke test**

Run: `yarn tauri dev` (or `yarn dev` for the web view).
Verify:
1. The floating Sparkles button appears bottom-right; clicking it (and Cmd/Ctrl+J) opens/closes the slide-over.
2. With no API key set, sending a message shows the "Add an API key in Settings → AI" error toast.
3. With a key set: "Plan my day" returns a reply and proposed action cards; Apply creates/changes tasks (visible in Today/Backlog); Dismiss removes the card; dropping a task asks for confirmation first.
4. Esc and the X close the panel; "Clear" empties the conversation.

- [ ] **Step 4: Final commit (if any docs/notes changed)**

```bash
git status   # expect clean if all prior tasks committed
```

---

## Self-Review notes (already reconciled)

- **Spec coverage:** propose-then-confirm (Tasks 10, 11), action registry extension point (Task 5), provider-agnostic structured JSON (Tasks 1, 7), ephemeral slide-over (Tasks 9, 16), reuse of `generateText` layer (Tasks 1–2, `generateText` untouched), reuse of `DebriefContent` (Task 12), six v1 actions (Task 5), a11y focus-trap/`aria-live`/Esc (Tasks 15, 16), honest no-key/error states (Tasks 2, 10), starter chips (Task 13), testing of pure modules + store (Tasks 1, 4–10).
- **Shortcut deviation** from spec ("global" → in-app Cmd/Ctrl+J) is stated in the File Structure note and Task 17.
- **Type consistency:** `AssistantTaskStore`, `ProposedAction`, `ChatMessage`, `ChatTurn`, `AssistantContext`, `ACTION_REGISTRY`, `validateAction`, `runAssistantTurn`, `buildAssistantContext`, `buildAssistantSystemPrompt`, `parseAssistantResponse` are defined once (Tasks 1, 3, 4, 5, 6, 7, 8) and used with matching signatures thereafter.
