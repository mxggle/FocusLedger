# L1 General Tool-Calling Assistant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Yolo's closed 7-action assistant with a general tool-calling agent over a domain tool registry, add user-settable permission levels (Plan/Ask/Auto), and add session undo (revert).

**Architecture:** A registry of `AgentTool`s (read + write) executed in a JSON tool-call loop. The model emits `{tool_calls:[{name,args}]}` or a final Markdown answer; we validate args (zod), gate writes by permission level, execute (capturing an inverse for undo) or defer to a confirm card, and feed results back until a final answer. No provider changes.

**Tech Stack:** TypeScript, React 18, Zustand, Tauri SQL plugin, Vitest, zod (new dep).

**Spec (read first — it has the full contracts and rationale):** [docs/superpowers/specs/2026-06-23-assistant-tool-calling-agent-L1-design.md](../specs/2026-06-23-assistant-tool-calling-agent-L1-design.md)

**Conventions for this plan:**
- Code blocks are complete unless a row in a **tool table** specifies a tool — those rows give the exact args schema, store call, summary, and undo for that tool; implement each exactly as written (they are specifications, not "same as above").
- Run tests with `yarn test <path>`; full suite `yarn test`; type-check/bundle `yarn build`.
- Baseline before starting: `yarn test` and `yarn build` are green on branch `feat/ai-features`.

---

## Phase 0 — Dependency + types

### Task 1: Add zod and the core tool types

**Files:**
- Modify: `package.json` (add `zod`)
- Create: `src/services/ai/assistant/agentTools/types.ts`

- [ ] **Step 1: Install zod**

Run: `yarn add zod`
Expected: `zod` appears in `package.json` dependencies; `yarn.lock` updated.

- [ ] **Step 2: Create the types module** (transcribe exactly; these are referenced by every later task)

```ts
// src/services/ai/assistant/agentTools/types.ts
import type { z } from "zod";
import type { Task, CreateTaskInput, UpdateTaskInput } from "../../../../types";
import type { AssistantContext } from "../types";
import type { RetrospectiveInsights } from "../../../retrospect/types";
import type { RecallEntry } from "../recallHistory";

export type ToolCategory = "read" | "write";

export type TaskUndoSnapshot = Pick<
  Task,
  | "title" | "description" | "category_id" | "priority" | "estimated_minutes"
  | "due_date" | "planned_start_time" | "planned_end_time" | "status" | "updated_at"
>;

export type UndoOp =
  | { kind: "delete_task"; taskId: string }
  | { kind: "restore_task"; taskId: string; before: TaskUndoSnapshot };

export type ToolResult =
  | { ok: true; summary: string; data?: unknown; undo?: UndoOp }
  | { ok: false; error: string };

export interface AgentTaskStore {
  getAllTasks(): Task[];
  getCategories(): { id: string; name: string }[];
  createTask(input: CreateTaskInput): Promise<{ ok: boolean; id?: string; message?: string }>;
  updateTask(id: string, input: UpdateTaskInput): Promise<{ ok: boolean; message?: string }>;
  deleteTask(id: string): Promise<{ ok: boolean; message?: string }>;
  startTask(id: string): Promise<"started" | "failed">;
  pauseActiveTask(): Promise<{ ok: boolean; message?: string }>;
  completeTask(id: string, note?: string): Promise<{ ok: boolean; message?: string }>;
  dropTask(id: string): Promise<{ ok: boolean; message?: string }>;
  moveTaskToBacklog(id: string): Promise<{ ok: boolean; message?: string }>;
  ensureCategory(name: string): Promise<string>;
  refresh(): Promise<void>;
}

export type AgentToolDeps = {
  store: AgentTaskStore;
  ctx: AssistantContext;
  insights: RetrospectiveInsights | null;
  history: RecallEntry[];
  now: () => string;
};

export type AgentTool = {
  name: string;
  category: ToolCategory;
  destructive: boolean;
  description: string;
  paramsHint: string;            // human-readable param doc for the prompt
  parameters: z.ZodType<unknown>;
  execute: (args: unknown, deps: AgentToolDeps) => Promise<ToolResult>;
};

export type PermissionLevel = "plan" | "ask" | "auto";

export type ToolCallStatus = "executed" | "pending" | "failed" | "reverted" | "dismissed";
export type ToolCallRecord = {
  id: string;
  name: string;
  args: unknown;
  category: ToolCategory;
  destructive: boolean;
  summary: string;
  status: ToolCallStatus;
  result?: string;
  error?: string;
  undo?: UndoOp;
  expectedUpdatedAt?: string; // for restore_task drift: task.updated_at immediately after execution
};
```

- [ ] **Step 3: Verify build**

Run: `yarn build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json yarn.lock src/services/ai/assistant/agentTools/types.ts
git commit -m "feat(agent): zod dep + core tool-calling types"
```

---

## Phase 1 — Pure logic (permissions + undo)

### Task 2: Permission gating

**Files:**
- Create: `src/services/ai/assistant/agentTools/permissions.ts`
- Test: `src/services/ai/assistant/agentTools/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// permissions.test.ts
import { describe, expect, it } from "vitest";
import { needsConfirm } from "./permissions";
import type { AgentTool } from "./types";

const read = { category: "read", destructive: false } as AgentTool;
const write = { category: "write", destructive: false } as AgentTool;
const destructive = { category: "write", destructive: true } as AgentTool;

describe("needsConfirm", () => {
  it("never confirms read tools", () => {
    for (const l of ["plan", "ask", "auto"] as const) expect(needsConfirm(read, l)).toBe(false);
  });
  it("plan and ask defer all writes", () => {
    for (const l of ["plan", "ask"] as const) {
      expect(needsConfirm(write, l)).toBe(true);
      expect(needsConfirm(destructive, l)).toBe(true);
    }
  });
  it("auto executes reversible writes, confirms destructive", () => {
    expect(needsConfirm(write, "auto")).toBe(false);
    expect(needsConfirm(destructive, "auto")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `yarn test src/services/ai/assistant/agentTools/permissions.test.ts`

- [ ] **Step 3: Implement**

```ts
// permissions.ts
import type { AgentTool, PermissionLevel } from "./types";

/** Whether a tool call must be deferred to a user confirm card instead of executing in-loop. */
export function needsConfirm(tool: AgentTool, level: PermissionLevel): boolean {
  if (tool.category === "read") return false;
  if (level === "auto") return tool.destructive;
  return true; // plan + ask defer every write
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/agentTools/permissions.ts src/services/ai/assistant/agentTools/permissions.test.ts
git commit -m "feat(agent): permission-level write gating"
```

### Task 3: Revert (session undo)

**Files:**
- Create: `src/services/ai/assistant/agentTools/revert.ts`
- Test: `src/services/ai/assistant/agentTools/revert.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// revert.test.ts
import { describe, expect, it, vi } from "vitest";
import { hasDrifted, revertToolCall } from "./revert";
import type { AgentTaskStore, ToolCallRecord, TaskUndoSnapshot } from "./types";

function store(): AgentTaskStore {
  return {
    getAllTasks: () => [], getCategories: () => [],
    createTask: vi.fn(async () => ({ ok: true })),
    updateTask: vi.fn(async () => ({ ok: true })),
    deleteTask: vi.fn(async () => ({ ok: true })),
    startTask: vi.fn(async () => "started" as const),
    pauseActiveTask: vi.fn(async () => ({ ok: true })),
    completeTask: vi.fn(async () => ({ ok: true })),
    dropTask: vi.fn(async () => ({ ok: true })),
    moveTaskToBacklog: vi.fn(async () => ({ ok: true })),
    ensureCategory: vi.fn(async () => "c1"),
    refresh: vi.fn(async () => {})
  };
}
const before: TaskUndoSnapshot = {
  title: "T", description: null, category_id: null, priority: "medium",
  estimated_minutes: null, due_date: null, planned_start_time: "09:00",
  planned_end_time: null, status: "todo", updated_at: "2026-06-23T00:00:00.000Z"
};
function rec(undo: ToolCallRecord["undo"]): ToolCallRecord {
  return { id: "r1", name: "update_task", args: {}, category: "write", destructive: false, summary: "s", status: "executed", undo };
}

describe("revertToolCall", () => {
  it("restore_task writes the prior snapshot back", async () => {
    const s = store();
    const res = await revertToolCall(rec({ kind: "restore_task", taskId: "t1", before }), s);
    expect(res.ok).toBe(true);
    expect(s.updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:00", status: "todo" }));
  });
  it("delete_task removes a created task", async () => {
    const s = store();
    await revertToolCall(rec({ kind: "delete_task", taskId: "t9" }), s);
    expect(s.deleteTask).toHaveBeenCalledWith("t9");
  });
  it("flags drift only when current updated_at differs from the post-action expected value", () => {
    const r = { ...rec({ kind: "restore_task", taskId: "t1", before }), expectedUpdatedAt: "u1" };
    expect(hasDrifted(r, { updated_at: "u1" })).toBe(false);
    expect(hasDrifted(r, { updated_at: "u2" })).toBe(true);
  });
  it("refuses when not executed or no undo", async () => {
    const s = store();
    const r = { ...rec(undefined), status: "pending" as const };
    expect((await revertToolCall(r, s)).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
// revert.ts
import type { AgentTaskStore, ToolCallRecord } from "./types";

/** Reverse one executed write. Best-effort; the caller handles drift confirmation. */
export async function revertToolCall(
  rec: ToolCallRecord,
  store: AgentTaskStore
): Promise<{ ok: boolean; message?: string }> {
  if (rec.status !== "executed" || !rec.undo) return { ok: false, message: "Nothing to revert" };
  if (rec.undo.kind === "delete_task") return store.deleteTask(rec.undo.taskId);
  const { taskId, before } = rec.undo;
  return store.updateTask(taskId, {
    title: before.title,
    description: before.description,
    category_id: before.category_id,
    priority: before.priority,
    estimated_minutes: before.estimated_minutes,
    due_date: before.due_date,
    planned_start_time: before.planned_start_time,
    planned_end_time: before.planned_end_time,
    status: before.status
  });
}

/** True when the live task changed since the action ran (revert would clobber newer edits). */
export function hasDrifted(rec: ToolCallRecord, current: { updated_at: string } | undefined): boolean {
  if (!rec.undo || rec.undo.kind !== "restore_task") return false;
  if (!current) return false; // missing task handled by caller
  if (!rec.expectedUpdatedAt) return false; // legacy executed records cannot be drift-checked
  return current.updated_at !== rec.expectedUpdatedAt;
}
```

> Drift note: `hasDrifted` compares the live task's `updated_at` to `rec.expectedUpdatedAt`, captured from the task row immediately after the action succeeds. Do **not** compare against `rec.undo.before.updated_at`: `taskRepository.updateTask()` advances `updated_at` during the write, so the pre-action value would make every successful write look drifted. The UI/store wiring uses drift to ask "changed since — revert anyway?" (Tasks 13-14). For missing tasks (`current === undefined`) the caller reports "task was deleted."

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/assistant/agentTools/revert.ts src/services/ai/assistant/agentTools/revert.test.ts
git commit -m "feat(agent): session revert (undo) with drift detection"
```

---

## Phase 2 — Store adapter + tools

### Task 4: Store adapter

**Files:**
- Create: `src/services/ai/assistant/agentTools/storeAdapter.ts`
- Test: `src/services/ai/assistant/agentTools/storeAdapter.test.ts`

The adapter implements `AgentTaskStore` from `useTaskStore.getState()`. Its `createTask` MUST surface the new id (diff `getAllTasks()` before/after if the store return lacks it — spec §3.1).

- [ ] **Step 1: Write the failing test**

```ts
// storeAdapter.test.ts
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../../../types";

const state = vi.hoisted(() => ({
  allTasks: [] as Task[],
  categories: [{ id: "c1", name: "Dev" }],
  createTask: vi.fn(async () => ({ ok: true })),
  updateTask: vi.fn(async () => ({ ok: true })),
  deleteTask: vi.fn(async () => ({ ok: true })),
  startTask: vi.fn(async () => "started"),
  pauseActiveTask: vi.fn(async () => ({ ok: true })),
  completeTask: vi.fn(async () => ({ ok: true })),
  dropTask: vi.fn(async () => ({ ok: true })),
  moveTaskToBacklog: vi.fn(async () => ({ ok: true })),
  ensureCategory: vi.fn(async () => "c1"),
  refresh: vi.fn(async () => {})
}));
vi.mock("../../../../stores/taskStore", () => ({ useTaskStore: { getState: () => state } }));

import { createAgentTaskStore } from "./storeAdapter";

function task(id: string): Task {
  return {
    id, title: id, description: null, category_id: null, status: "todo", priority: "medium",
    estimated_minutes: null, due_date: null, template_id: null, planned_start_time: null,
    planned_end_time: null, sort_order: null, created_at: "x", updated_at: "x",
    completed_at: null, dropped_at: null
  };
}

describe("createAgentTaskStore", () => {
  it("reads live tasks/categories", () => {
    state.allTasks = [task("t1")];
    const s = createAgentTaskStore();
    expect(s.getAllTasks().map((t) => t.id)).toEqual(["t1"]);
    expect(s.getCategories()).toEqual([{ id: "c1", name: "Dev" }]);
  });
  it("createTask captures the new id by diffing when the store omits it", async () => {
    const before = [task("t1")];
    state.allTasks = before;
    state.createTask.mockImplementation(async () => { state.allTasks = [...before, task("t2")]; return { ok: true }; });
    const s = createAgentTaskStore();
    const res = await s.createTask({ title: "new" });
    expect(res).toEqual({ ok: true, id: "t2" });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
// storeAdapter.ts
import { useTaskStore } from "../../../../stores/taskStore";
import type { AgentTaskStore } from "./types";
import type { CreateTaskInput, UpdateTaskInput } from "../../../../types";

export function createAgentTaskStore(): AgentTaskStore {
  const s = () => useTaskStore.getState();
  return {
    getAllTasks: () => s().allTasks,
    getCategories: () => s().categories.map((c) => ({ id: c.id, name: c.name })),
    async createTask(input: CreateTaskInput) {
      const beforeIds = new Set(s().allTasks.map((t) => t.id));
      const res = await s().createTask(input);
      const ok = (res as { ok?: boolean })?.ok !== false;
      const direct = (res as { id?: string })?.id;
      const created = direct ?? s().allTasks.find((t) => !beforeIds.has(t.id))?.id;
      return { ok, id: created, message: (res as { message?: string })?.message };
    },
    async updateTask(id: string, input: UpdateTaskInput) {
      const res = await s().updateTask(id, input);
      return { ok: (res as { ok?: boolean })?.ok !== false, message: (res as { message?: string })?.message };
    },
    async deleteTask(id) { const r = await s().deleteTask(id); return { ok: (r as { ok?: boolean })?.ok !== false }; },
    async startTask(id) { return s().startTask(id); },
    async pauseActiveTask() { const r = await s().pauseActiveTask(); return { ok: (r as { ok?: boolean })?.ok !== false }; },
    async completeTask(id, note) { const r = await s().completeTask(id, note); return { ok: (r as { ok?: boolean })?.ok !== false }; },
    async dropTask(id) { const r = await s().dropTask(id); return { ok: (r as { ok?: boolean })?.ok !== false }; },
    async moveTaskToBacklog(id) { const r = await s().moveTaskToBacklog(id); return { ok: (r as { ok?: boolean })?.ok !== false }; },
    ensureCategory: (name) => s().ensureCategory(name),
    refresh: () => s().refresh()
  };
}
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(agent): taskStore→AgentTaskStore adapter with created-id capture`.

### Task 5: Shared tool helpers + the keystone `update_task`

**Files:**
- Create: `src/services/ai/assistant/agentTools/helpers.ts` (id/category/date/time resolution + snapshot)
- Create: `src/services/ai/assistant/agentTools/updateTask.ts`
- Test: `src/services/ai/assistant/agentTools/updateTask.test.ts`

- [ ] **Step 1: helpers.ts** (no test by itself; covered via tools)

```ts
// helpers.ts
import type { Task, TaskPriority } from "../../../../types";
import type { AgentToolDeps, TaskUndoSnapshot } from "./types";

export function findTask(deps: AgentToolDeps, id: string): Task | undefined {
  return deps.store.getAllTasks().find((t) => t.id === id);
}
export function snapshot(t: Task): TaskUndoSnapshot {
  return {
    title: t.title, description: t.description, category_id: t.category_id, priority: t.priority,
    estimated_minutes: t.estimated_minutes, due_date: t.due_date,
    planned_start_time: t.planned_start_time, planned_end_time: t.planned_end_time,
    status: t.status, updated_at: t.updated_at
  };
}
export function resolveCategoryId(deps: AgentToolDeps, ref: string | undefined): { id: string | null; createName: string | null } {
  if (!ref || !ref.trim()) return { id: null, createName: null };
  const needle = ref.trim().toLowerCase();
  const match = deps.store.getCategories().find((c) => c.id.toLowerCase() === needle || c.name.toLowerCase() === needle);
  return match ? { id: match.id, createName: null } : { id: null, createName: ref.trim() };
}
export function resolveDueDate(deps: AgentToolDeps, ref: string | undefined): string | null | undefined {
  if (ref === undefined) return undefined;        // field not provided
  if (ref === null || ref === "") return null;     // explicit clear → backlog
  if (ref.toLowerCase() === "today") return deps.ctx.today;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ref)) return ref;
  throw new Error(`due_date must be "today" or YYYY-MM-DD`);
}
export const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
```

- [ ] **Step 2: Write the failing test for update_task**

```ts
// updateTask.test.ts
import { describe, expect, it, vi } from "vitest";
import { updateTaskTool } from "./updateTask";
import type { AgentToolDeps } from "./types";
import type { Task } from "../../../../types";

function task(p: Partial<Task> & { id: string }): Task {
  return {
    id: p.id, title: p.title ?? "Report", description: null, category_id: null, status: p.status ?? "todo",
    priority: p.priority ?? "medium", estimated_minutes: null, due_date: null, template_id: null,
    planned_start_time: p.planned_start_time ?? null, planned_end_time: p.planned_end_time ?? null,
    sort_order: null, created_at: "x", updated_at: p.updated_at ?? "u0", completed_at: null, dropped_at: null
  };
}
function deps(tasks: Task[], updateTask = vi.fn(async () => ({ ok: true }))): AgentToolDeps {
  return {
    store: {
      getAllTasks: () => tasks, getCategories: () => [{ id: "c1", name: "Dev" }],
      createTask: vi.fn(), updateTask, deleteTask: vi.fn(), startTask: vi.fn(), pauseActiveTask: vi.fn(),
      completeTask: vi.fn(), dropTask: vi.fn(), moveTaskToBacklog: vi.fn(), ensureCategory: vi.fn(async () => "c2"), refresh: vi.fn()
    } as never,
    ctx: { today: "2026-06-23" } as never, insights: null, history: [], now: () => "t1"
  };
}

describe("update_task tool", () => {
  it("sets planned_start_time and returns a restore_task undo with the prior value", async () => {
    const t = task({ id: "t1", planned_start_time: "09:00", updated_at: "u0" });
    const update = vi.fn(async () => ({ ok: true }));
    const res = await updateTaskTool.execute({ task_id: "t1", planned_start_time: "09:30" }, deps([t], update));
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
    if (res.ok) expect(res.undo).toEqual({ kind: "restore_task", taskId: "t1", before: expect.objectContaining({ planned_start_time: "09:00" }) });
  });
  it("rejects an unknown task id", async () => {
    const res = await updateTaskTool.execute({ task_id: "ghost", title: "X" }, deps([]));
    expect(res.ok).toBe(false);
  });
  it("rejects a bad time format", async () => {
    const res = await updateTaskTool.execute({ task_id: "t1", planned_start_time: "9am" }, deps([task({ id: "t1" })]));
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Implement update_task**

```ts
// updateTask.ts
import { z } from "zod";
import type { AgentTool, AgentToolDeps, ToolResult } from "./types";
import type { UpdateTaskInput } from "../../../../types";
import { findTask, snapshot, resolveCategoryId, resolveDueDate, PRIORITIES, HHMM_RE } from "./helpers";

const schema = z.object({
  task_id: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  estimated_minutes: z.number().positive().optional(),
  due_date: z.string().nullable().optional(),
  planned_start_time: z.string().nullable().optional(),
  planned_end_time: z.string().nullable().optional(),
  status: z.enum(["todo", "doing", "paused", "done", "dropped"]).optional()
});

function checkTime(v: string | null | undefined, label: string): void {
  if (typeof v === "string" && v !== "" && !HHMM_RE.test(v)) throw new Error(`${label} must be HH:mm`);
}

export const updateTaskTool: AgentTool = {
  name: "update_task",
  category: "write",
  destructive: false,
  description:
    "Change one or more fields of an existing task: title, description, category, priority, estimated_minutes, due_date, planned_start_time/planned_end_time (\"HH:mm\"), or status. Use this to recategorize, re-estimate, reschedule the day, or shift start/end times.",
  paramsHint:
    'task_id (required) + any of: title, description, category, priority(low|medium|high), estimated_minutes, due_date("today"|YYYY-MM-DD|null), planned_start_time("HH:mm"|null), planned_end_time("HH:mm"|null), status',
  parameters: schema,
  async execute(rawArgs, deps: AgentToolDeps): Promise<ToolResult> {
    const args = schema.parse(rawArgs);
    const task = findTask(deps, args.task_id);
    if (!task) return { ok: false, error: `Unknown task_id "${args.task_id}"` };
    try {
      checkTime(args.planned_start_time, "planned_start_time");
      checkTime(args.planned_end_time, "planned_end_time");
      const changes: UpdateTaskInput = {};
      const parts: string[] = [];
      if (args.title !== undefined) { changes.title = args.title; parts.push(`title`); }
      if (args.description !== undefined) { changes.description = args.description; parts.push("description"); }
      if (args.priority !== undefined) { changes.priority = args.priority; parts.push(`priority ${args.priority}`); }
      if (args.estimated_minutes !== undefined) { changes.estimated_minutes = args.estimated_minutes; parts.push(`est ${args.estimated_minutes}m`); }
      if (args.status !== undefined) { changes.status = args.status; parts.push(`status ${args.status}`); }
      if (args.due_date !== undefined) { changes.due_date = resolveDueDate(deps, args.due_date); parts.push(changes.due_date ? `due ${changes.due_date}` : "backlog"); }
      if (args.planned_start_time !== undefined) { changes.planned_start_time = args.planned_start_time || null; parts.push(`start ${changes.planned_start_time ?? "cleared"}`); }
      if (args.planned_end_time !== undefined) { changes.planned_end_time = args.planned_end_time || null; parts.push(`end ${changes.planned_end_time ?? "cleared"}`); }
      if (args.category !== undefined) {
        const { id, createName } = resolveCategoryId(deps, args.category);
        changes.category_id = id ?? (createName ? await deps.store.ensureCategory(createName) : null);
        parts.push("category");
      }
      if (parts.length === 0) return { ok: false, error: "Provide at least one field to change" };
      const before = snapshot(task);
      const res = await deps.store.updateTask(args.task_id, changes);
      if (!res.ok) return { ok: false, error: res.message ?? "update failed" };
      return { ok: true, summary: `Updated "${task.title}": ${parts.join(", ")}`, undo: { kind: "restore_task", taskId: args.task_id, before } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "invalid update" };
    }
  }
};
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(agent): update_task tool (any field, incl. times) + helpers`.

### Task 6: `create_task` + status-changing write tools

**Files:**
- Create: `createTask.ts`, `startTask.ts`, `pauseTask.ts`, `completeTask.ts`, `moveToBacklog.ts`, `dropTask.ts`
- Test: `writeTools.test.ts`

Implement each per this table (all `category:"write"`; `drop_task` is the only `destructive:true`). Each captures `before = snapshot(task)` before mutating (except create) and returns the listed `undo`. On unknown id → `{ok:false}`. On store failure → `{ok:false, error}`.

| tool | parameters (zod) | store call | summary | undo |
|---|---|---|---|---|
| `create_task` | `{title:str≥1, description?:str|null, category?:str, priority?:enum, estimated_minutes?:num>0, due_date?:str|null, planned_start_time?:str|null, planned_end_time?:str|null}` (validate times w/ `HHMM_RE`, resolve category via `ensureCategory` if new, `due_date` via `resolveDueDate`) | `store.createTask(input)` | `Created "<title>" <for date|in backlog>` | `{kind:"delete_task", taskId: res.id}` (use the adapter-captured id; if `res.id` is missing → return `{ok:false,error}` because the write cannot be reverted) |
| `start_task` | `{task_id:str≥1}` | `store.startTask(id)` (returns "started"/"failed") | `Started focus on "<title>"` | `{kind:"restore_task", taskId, before}` |
| `pause_task` | `{}` | `store.pauseActiveTask()` (pauses the running task; resolve which via `getAllTasks().find(status==="doing")` for the snapshot/summary) | `Paused "<title>"` | `{kind:"restore_task", taskId, before}` (omit undo if nothing was running) |
| `complete_task` | `{task_id:str≥1, note?:str}` | `store.completeTask(id, note)` | `Marked "<title>" done` | `{kind:"restore_task", taskId, before}` |
| `move_to_backlog` | `{task_id:str≥1}` | `store.moveTaskToBacklog(id)` | `Moved "<title>" to backlog` | `{kind:"restore_task", taskId, before}` |
| `drop_task` | `{task_id:str≥1}` (**destructive:true**) | `store.dropTask(id)` | `Dropped "<title>"` | `{kind:"restore_task", taskId, before}` |

- [ ] **Step 1: Write failing tests** (`writeTools.test.ts`) — for each tool: valid call invokes the right store method and returns the listed `undo`; unknown id → `{ok:false}`. Use the `deps`/`task` helpers from Task 5's test (copy them in). Example for `create_task`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createTaskTool } from "./createTask";
// ...reuse deps()/task() helpers...
it("create_task creates and returns delete_task undo", async () => {
  const create = vi.fn(async () => ({ ok: true, id: "new1" }));
  const d = deps([], undefined); (d.store as never as { createTask: unknown }).createTask = create;
  const res = await createTaskTool.execute({ title: "Plan launch", due_date: "today" }, d);
  expect(create).toHaveBeenCalled();
  if (res.ok) expect(res.undo).toEqual({ kind: "delete_task", taskId: "new1" });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** each tool file per the table (mirror `updateTask.ts` structure: zod parse → find task (except create) → snapshot → store call → result+undo; wrap in try/catch returning `{ok:false,error}`).
- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(agent): create/start/pause/complete/move/drop write tools with undo`.

### Task 7: Read tools

**Files:**
- Create: `listTasks.ts`, `getTask.ts`, `searchTasks.ts`, `listCategories.ts`, `getCalibration.ts`, `recall.ts`, `dailySummary.ts`
- Test: `readTools.test.ts`

All `category:"read"`, `destructive:false`, no `undo`. `list_tasks`/`get_task` MUST include `planned_start_time`/`planned_end_time` in their rendered output (the perception fix). Port `search_tasks`, `get_calibration`, `recall` logic from the current `src/services/ai/assistant/tools.ts` (keyword scan, calibration stat, reflection scan) — read that file and reuse the scoring. `daily_summary` reuses `computeDayBriefing` from `dayBriefing.ts`.

| tool | parameters | returns (summary text) |
|---|---|---|
| `list_tasks` | `{scope?:"today"|"backlog"|"all", status?:enum, category?:str, undated?:bool}` (default scope "today") | lines `- [id] "title" (status, priority, <start–end or "no time">, due <date>, <category>, est <n>m)` |
| `get_task` | `{task_id:str≥1}` | one task with all fields incl. times |
| `search_tasks` | `{query:str≥1}` | keyword matches (port from tools.ts) |
| `list_categories` | `{}` | `name [id]` list |
| `get_calibration` | `{category?:str}` | calibration ratio (port from tools.ts) |
| `recall` | `{query:str≥1}` | reflection snippets (port from tools.ts) |
| `daily_summary` | `{scope?:"today"|YYYY-MM-DD}` | `computeDayBriefing` numbers as text |

- [ ] **Step 1: Write failing tests** for `list_tasks` (renders times for a task with `planned_start_time:"09:00"`, `planned_end_time:"10:00"`; filters by scope/status) and `search_tasks` (keyword match). Use `deps`/`task` helpers.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** each read tool per the table; `list_tasks`/`get_task` include times.
- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(agent): read tools (list/get/search/categories/calibration/recall/daily_summary) with times`.

### Task 8: Tool registry

**Files:**
- Create: `src/services/ai/assistant/agentTools/registry.ts`
- Test: `registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// registry.test.ts
import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, toolByName, renderToolCatalog } from "./registry";

describe("agent tool registry", () => {
  it("includes the general write tools and read tools", () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    for (const n of ["list_tasks", "update_task", "create_task", "drop_task", "start_task"]) expect(names).toContain(n);
  });
  it("toolByName resolves and renderToolCatalog lists every tool", () => {
    expect(toolByName("update_task")?.name).toBe("update_task");
    const cat = renderToolCatalog();
    for (const t of AGENT_TOOLS) expect(cat).toContain(t.name);
  });
  it("only drop_task is destructive", () => {
    expect(AGENT_TOOLS.filter((t) => t.destructive).map((t) => t.name)).toEqual(["drop_task"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement**

```ts
// registry.ts
import type { AgentTool } from "./types";
import { listTasksTool } from "./listTasks";
import { getTaskTool } from "./getTask";
import { searchTasksTool } from "./searchTasks";
import { listCategoriesTool } from "./listCategories";
import { getCalibrationTool } from "./getCalibration";
import { recallTool } from "./recall";
import { dailySummaryTool } from "./dailySummary";
import { createTaskTool } from "./createTask";
import { updateTaskTool } from "./updateTask";
import { startTaskTool } from "./startTask";
import { pauseTaskTool } from "./pauseTask";
import { completeTaskTool } from "./completeTask";
import { moveToBacklogTool } from "./moveToBacklog";
import { dropTaskTool } from "./dropTask";

export const AGENT_TOOLS: AgentTool[] = [
  listTasksTool, getTaskTool, searchTasksTool, listCategoriesTool, getCalibrationTool, recallTool, dailySummaryTool,
  createTaskTool, updateTaskTool, startTaskTool, pauseTaskTool, completeTaskTool, moveToBacklogTool, dropTaskTool
];

const BY_NAME = new Map(AGENT_TOOLS.map((t) => [t.name, t]));
export function toolByName(name: string): AgentTool | undefined { return BY_NAME.get(name); }

export function renderToolCatalog(): string {
  return AGENT_TOOLS.map((t) => `- ${t.name}: ${t.description} params: ${t.paramsHint}`).join("\n");
}
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(agent): tool registry + catalog`.

---

## Phase 3 — Parser + loop

### Task 9: Tool-call parser

**Files:**
- Modify: `src/services/ai/assistant/responseParser.ts`
- Test: extend `src/services/ai/assistant/responseParser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { parseToolCalls } from "./responseParser";
describe("parseToolCalls", () => {
  it("parses a tool_calls object", () => {
    const raw = '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}},{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}';
    expect(parseToolCalls(raw)).toEqual([
      { name: "list_tasks", args: { scope: "today" } },
      { name: "update_task", args: { task_id: "t1", planned_start_time: "09:30" } }
    ]);
  });
  it("returns null for a non-tool-call (final markdown) reply", () => {
    expect(parseToolCalls("Here is your plan.")).toBeNull();
    expect(parseToolCalls('{"reply":"x"}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** — add to `responseParser.ts` (keep existing exports for back-compat during migration):

```ts
export type ParsedToolCall = { name: string; args: unknown };

/** Parse a tool-call turn. Returns null when the text is a final (markdown) answer. */
export function parseToolCalls(raw: string): ParsedToolCall[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  if (typeof parsed !== "object" || parsed === null) return null;
  const calls = (parsed as Record<string, unknown>).tool_calls;
  if (!Array.isArray(calls)) return null;
  const cleaned = calls
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null && typeof (c as Record<string, unknown>).name === "string")
    .map((c) => ({ name: String(c.name), args: (c as Record<string, unknown>).args ?? {} }));
  return cleaned.length > 0 ? cleaned : null;
}
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(agent): tool-call JSON parser`.

### Task 10: The tool-calling loop

**Files:**
- Create: `src/services/ai/assistant/toolLoop.ts` (new loop; the old `agentLoop.ts` is removed in Task 15)
- Test: `src/services/ai/assistant/toolLoop.test.ts`

Behavior (spec §3.3–§3.4): build system prompt; loop ≤ `MAX_STEPS=12`; each turn → `parseToolCalls`; for each call validate via `tool.parameters.safeParse`; reads + auto-reversible writes execute (capture undo) and feed back; deferred writes become `pending` records fed back as "queued"; non-tool-call turn → final. Returns `{ reply, toolCalls }`.

For any executed write whose `undo.kind === "restore_task"`, re-read that task from `deps.store.getAllTasks()` immediately after the tool succeeds and set `ToolCallRecord.expectedUpdatedAt` to the live task's post-action `updated_at`. This is the value used for later drift detection; the pre-action `undo.before.updated_at` is only part of the restore snapshot.

- [ ] **Step 1: Write the failing test**

```ts
// toolLoop.test.ts
import { describe, expect, it, vi } from "vitest";
import { runToolLoop } from "./toolLoop";

function depsWith(updateTask = vi.fn(async () => ({ ok: true }))) {
  const tasks = [{ id: "t1", title: "Report", planned_start_time: "09:00", status: "todo", priority: "medium",
    description: null, category_id: null, estimated_minutes: null, due_date: "2026-06-23", template_id: null,
    planned_end_time: null, sort_order: null, created_at: "x", updated_at: "u0", completed_at: null, dropped_at: null }];
  return { store: { getAllTasks: () => tasks, getCategories: () => [], updateTask, createTask: vi.fn(), deleteTask: vi.fn(),
    startTask: vi.fn(), pauseActiveTask: vi.fn(), completeTask: vi.fn(), dropTask: vi.fn(), moveTaskToBacklog: vi.fn(),
    ensureCategory: vi.fn(), refresh: vi.fn() }, ctx: { today: "2026-06-23" }, insights: null, history: [], now: () => "u1" } as never;
}

it("auto mode: composes list_tasks then update_task, executes the write in-loop", async () => {
  const update = vi.fn(async () => ({ ok: true }));
  const replies = [
    '{"tool_calls":[{"name":"list_tasks","args":{"scope":"today"}}]}',
    '{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}',
    "Pushed your morning back 30 minutes."
  ];
  let i = 0;
  const generateChat = vi.fn(async () => replies[i++]);
  const res = await runToolLoop(
    { system: "sys", messages: [{ role: "user", content: "delay everything 30 min" }], level: "auto", deps: depsWith(update) },
    { generateChat }
  );
  expect(update).toHaveBeenCalledWith("t1", expect.objectContaining({ planned_start_time: "09:30" }));
  expect(res.reply).toContain("Pushed your morning");
  const exec = res.toolCalls.find((c) => c.name === "update_task");
  expect(exec?.status).toBe("executed");
  expect(exec?.undo).toBeTruthy();
});

it("ask mode: defers the write as pending (does not execute)", async () => {
  const update = vi.fn(async () => ({ ok: true }));
  const replies = ['{"tool_calls":[{"name":"update_task","args":{"task_id":"t1","planned_start_time":"09:30"}}]}', "Proposed."];
  let i = 0;
  const res = await runToolLoop(
    { system: "s", messages: [{ role: "user", content: "x" }], level: "ask", deps: depsWith(update) },
    { generateChat: vi.fn(async () => replies[i++]) }
  );
  expect(update).not.toHaveBeenCalled();
  expect(res.toolCalls.find((c) => c.name === "update_task")?.status).toBe("pending");
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `toolLoop.ts`:

```ts
import { generateChat as defaultGenerateChat } from "../chatClient";
import type { AiSettings, ChatInput, ChatTurn } from "../providers";
import { toolByName } from "./agentTools/registry";
import { needsConfirm } from "./agentTools/permissions";
import { parseToolCalls } from "./responseParser";
import { createId } from "../../../utils/id";
import type { AgentToolDeps, PermissionLevel, ToolCallRecord } from "./agentTools/types";

export const TOOL_TEMPERATURE = 0.3;
export const MAX_STEPS = 12;

export type ToolLoopInput = {
  settings: AiSettings;
  system: string;
  messages: ChatTurn[];
  level: PermissionLevel;
  deps: AgentToolDeps;
  onStep?: (label: string) => void;
};
export type ToolLoopDeps = { generateChat: (s: AiSettings, i: ChatInput) => Promise<string> };
export type ToolLoopResult = { reply: string; toolCalls: ToolCallRecord[] };

function expectedUpdatedAtFor(rec: Pick<ToolCallRecord, "undo">, deps: AgentToolDeps): string | undefined {
  if (!rec.undo || rec.undo.kind !== "restore_task") return undefined;
  const taskId = rec.undo.taskId;
  return deps.store.getAllTasks().find((task) => task.id === taskId)?.updated_at;
}

export async function runToolLoop(
  input: Omit<ToolLoopInput, "settings"> & { settings?: AiSettings },
  deps: ToolLoopDeps = { generateChat: defaultGenerateChat }
): Promise<ToolLoopResult> {
  const settings = input.settings ?? ({} as AiSettings);
  const messages: ChatTurn[] = [...input.messages];
  const records: ToolCallRecord[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const raw = await deps.generateChat(settings, { system: input.system, messages, temperature: TOOL_TEMPERATURE });
    const calls = parseToolCalls(raw);
    if (!calls) return { reply: raw.trim(), toolCalls: records };

    const feedback: string[] = [];
    for (const call of calls) {
      const tool = toolByName(call.name);
      if (!tool) { feedback.push(`${call.name}: unknown tool`); continue; }
      const parsed = tool.parameters.safeParse(call.args);
      if (!parsed.success) { feedback.push(`${call.name}: invalid args — ${parsed.error.issues[0]?.message ?? "bad args"}`); continue; }

      if (tool.category === "read") {
        const r = await tool.execute(call.args, input.deps);
        feedback.push(`${call.name}: ${r.ok ? r.summary : r.error}`);
        input.onStep?.(`Looking up ${call.name}…`);
        continue;
      }
      // write
      const base: ToolCallRecord = { id: createId("tc"), name: call.name, args: call.args, category: "write", destructive: tool.destructive, summary: call.name, status: "pending" };
      if (needsConfirm(tool, input.level)) {
        records.push({ ...base, status: "pending" });
        feedback.push(`${call.name}: queued for the user's confirmation (not applied yet)`);
      } else {
        const r = await tool.execute(call.args, input.deps);
        if (r.ok) {
          const undo = r.undo;
          records.push({
            ...base,
            status: "executed",
            summary: r.summary,
            result: r.summary,
            undo,
            expectedUpdatedAt: expectedUpdatedAtFor({ undo }, input.deps)
          });
          feedback.push(`${call.name}: ${r.summary}`);
        }
        else { records.push({ ...base, status: "failed", error: r.error, result: r.error }); feedback.push(`${call.name}: FAILED — ${r.error}`); }
      }
    }
    messages.push({ role: "assistant", content: raw });
    messages.push({ role: "user", content: `Tool results:\n${feedback.join("\n")}\n\nContinue, or give your final answer.` });
  }
  // budget exhausted: force a final answer
  const finalRaw = await deps.generateChat(settings, { system: input.system, messages: [...messages, { role: "user", content: "Give your final answer now (plain text, no tool calls)." }], temperature: TOOL_TEMPERATURE }).catch(() => "");
  return { reply: finalRaw.trim(), toolCalls: records };
}
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(agent): tool-calling loop with permission gating`.

---

## Phase 4 — Prompt, context, settings, types

### Task 11: ContextTask times + system prompt rewrite

**Files:** Modify `types.ts` (`ContextTask` + `ChatMessage.toolCalls`), `contextBuilder.ts`, `systemPrompt.ts`; extend `systemPrompt.test.ts`, `contextBuilder.test.ts`.

- [ ] **Step 1: Failing tests** — `systemPrompt` includes the tool catalog (e.g. contains `update_task`), the honesty rule (`only for genuinely new work`), NO "decompose" wording, a permission line that varies by an added `ctx.permissionLevel`, and renders a task's `plannedStartTime` when set; `contextBuilder` passes through times.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement:**
  - `types.ts`: `ContextTask` += `plannedStartTime: string | null; plannedEndTime: string | null;`; `AssistantContext` += `permissionLevel?: PermissionLevel`; `ChatMessage` += `toolCalls?: ToolCallRecord[]`. Keep `ProposedAction`/`AssistantActionType` for now (removed in Task 15).
  - `contextBuilder.ts`: `toContextTask` sets `plannedStartTime: task.planned_start_time, plannedEndTime: task.planned_end_time`; thread `permissionLevel` from snapshot.
  - `systemPrompt.ts`: replace `renderActionCatalog()` + `TOOL_PROTOCOL` with `renderToolCatalog()` (from registry) and the tool-call protocol text; add honesty rule; add permission line:
    ```ts
    const MODE_LINE: Record<PermissionLevel, string> = {
      plan: "Permission: PLAN. Do not apply changes — explore with read tools and present a plan; your proposed changes are shown to the user for approval.",
      ask: "Permission: ASK. You may call write tools, but every change is confirmed by the user before it applies.",
      auto: "Permission: AUTO. Reversible changes apply immediately; destructive ones (drop_task) are confirmed."
    };
    ```
    and `describeTask` renders times: `09:00–10:00` / `no time`.
- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(agent): tool-catalog prompt, honesty rule, permission framing, schedule times in context`.

### Task 12: Settings — permission level

**Files:** Modify `src/types/settings.ts`; `src/components/settings/SettingsPage.tsx`.

- [ ] **Step 1:** Add to `AppSettings`: `assistantPermissionLevel: PermissionLevel;` (import the type) and to `DEFAULT_SETTINGS`: `assistantPermissionLevel: "auto",`.
- [ ] **Step 2:** In `SettingsPage.tsx` AI section add a 3-way control (reuse the radix toggle-group already used elsewhere) bound to `updateSetting("assistantPermissionLevel", …)` with labels Plan / Ask / Auto and a one-line hint each.
- [ ] **Step 3:** `yarn build` — PASS. **Step 4: Commit** `feat(agent): permission-level setting`.

---

## Phase 5 — Store wiring + UI

### Task 13: Wire the loop into assistantStore

**Files:** Modify `src/stores/assistantStore.ts`, `src/services/ai/assistant/assistantRunner.ts`; extend `assistantStore.test.ts`.

- [ ] **Step 1: Failing tests** — `send` runs `runToolLoop` (mock it) and stores the returned `reply` + `toolCalls` on the assistant message; `applyToolCall(messageId, toolCallId)` executes a pending tool (mock registry execute) → status `executed` + undo captured + `taskStore.refresh`; `revertTurn(messageId)` reverts executed writes.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement:**
  - Replace the `runAssistantTurnStreaming` body to build `system` (via `buildAssistantSystemPrompt`), `deps = { store: createAgentTaskStore(), ctx, insights, history, now }`, read `level = settings.assistantPermissionLevel`, and drive `runToolLoop`. Stream the final reply tokens; emit read-tool steps via `onStep`. (Tool-call JSON turns are buffered, same classification as today.)
  - Store `toolCalls` on the assistant `ChatMessage`; for executed reversible writes the message renders Done+Revert; pending → confirm cards. When a `restore_task` undo is captured, re-read the target task after the write and set `expectedUpdatedAt` to that post-action `updated_at` for drift detection.
  - Add store actions: `applyToolCall(messageId, id)` (run `toolByName(name).execute`, capture undo, set `expectedUpdatedAt` for `restore_task` undos, mark executed, `refresh`), `applyAllToolCalls(messageId)`, `revertToolCall(messageId, id)` (use `agentTools/revert.revertToolCall` + drift check via live task), `revertTurn(messageId)`, `dismissToolCall`.
  - Keep memory hooks unchanged (post-turn `runMemoryReview` with last user text + final reply).
- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(agent): drive tool-loop from assistantStore + apply/revert actions`.

### Task 14: UI — permission switcher, tool-call cards, revert

**Files:** Create `src/components/assistant/PermissionSwitcher.tsx` (+ test); modify `AssistantPanel.tsx`, `MessageRow.tsx`/`MessageList.tsx`, `ActionCard.tsx`, `ActionStatusBadge.tsx`.

- [ ] **Step 1: Failing tests** (use the `_render` helper in `src/components/assistant/_render.tsx`): `PermissionSwitcher` renders Plan/Ask/Auto and calls `updateSetting` on click; a message with a `pending` tool-call renders an Apply button; an `executed` reversible tool-call renders a Revert button that calls the store's revert.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement:**
  - `PermissionSwitcher` — segmented control bound to `assistantPermissionLevel`; mount in `AssistantPanel` header.
  - Card rendering: map `message.toolCalls` → cards (reuse `ActionCard`/`ActionStatusBadge`): `pending`→Apply (+ turn "Apply all"/"Run plan"), `executed`+reversible→Revert, `failed`→error, `reverted`/`dismissed`→badge. Read tool calls are not cards (they were steps).
  - **Back-compat:** if `message.toolCalls` is absent but `message.actions` is present (historical), render the legacy action cards as today.
  - Turn-level "Undo these changes" when the turn has ≥1 executed reversible write.
- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(agent): permission switcher + tool-call cards + revert UI`.

---

## Phase 6 — Cleanup + verification

### Task 15: Remove the legacy action/workflow system

**Files:** Delete `actions.ts`, `tools.ts`, `autoApply.ts` (+ their `.test.ts`); update any imports; remove `AssistantActionType` and action-parsing from `responseParser.ts`; keep `ProposedAction` type only for historical-message rendering.

- [ ] **Step 1:** `grep -rn "from \"./actions\"\|from \"./tools\"\|autoApply\|AssistantActionType\|ACTION_REGISTRY\|validateAction\|parseAssistantResponse\|parseLoopStep" src` — replace each usage with the new tool-loop equivalents (the only remaining consumers should be removed or repointed).
- [ ] **Step 2:** Delete the files: `git rm src/services/ai/assistant/actions.ts src/services/ai/assistant/actions.test.ts src/services/ai/assistant/tools.ts src/services/ai/assistant/tools.test.ts src/services/ai/assistant/autoApply.ts src/services/ai/assistant/autoApply.test.ts src/services/ai/assistant/agentLoop.ts src/services/ai/assistant/agentLoop.test.ts`.
- [ ] **Step 3:** `yarn build` — fix all type errors from removed symbols. `yarn test` — green.
- [ ] **Step 4: Commit** `refactor(agent): remove legacy action enum, lookups, autoApply, old loop`.

### Task 16: Docs + full verification + bug regression test

**Files:** Modify `docs/ai-architecture.md`; add `src/services/ai/assistant/toolLoop.regression.test.ts`.

- [ ] **Step 1:** Update `docs/ai-architecture.md` §3 to describe the tool-calling agent, the tool registry, permission levels, and session undo (replace the old "action registry"/"read tools (the agent loop)" subsections).
- [ ] **Step 2: Regression test** (the motivating bug): with the real registry + an injected `generateChat` that emits `list_tasks` then one `update_task(planned_start_time)` per returned task, `runToolLoop` in `auto` executes real `update_task` calls and creates **zero** `create_task` calls; and a request with no matching tool yields a final reply with an **empty** `toolCalls` array (never a `create_task`).

```ts
it("delays each today task by 30 min via update_task, never create_task", async () => {
  // two today tasks at 09:00 and 11:00; model lists then updates each
  // assert store.updateTask called for both with shifted times; store.createTask NOT called
});
it("an unsupported request does not fabricate a task", async () => {
  // model, lacking a tool, returns a plain apology; assert no write tool records
});
```

- [ ] **Step 3:** `yarn test` (all suites) + `yarn build` — green.
- [ ] **Step 4: Commit** `docs+test(agent): document tool-calling agent; regression for start-time shift & no-fabrication`.

---

## Self-Review (run against the spec)

- **Spec coverage:** tool registry/contracts → T1,T5–T8; permission levels (Plan/Ask/Auto + needsConfirm) → T2,T10,T11,T12,T14; session undo (UndoOp/restore/delete/drift) → T1,T3,T6,T13,T14; general `update_task` incl. times → T5; perception (ContextTask times) → T11; honesty rule → T11; loop protocol → T9,T10; settings → T12; UI/back-compat → T14; memory unchanged → T13; remove legacy → T15; docs + regression → T16. All spec sections mapped.
- **Placeholder scan:** none — code given for foundational/tricky parts; repetitive tools specified by exact per-tool tables (args/store-call/summary/undo), which are specifications, not "same as above."
- **Type consistency:** `AgentTool`/`AgentTaskStore`/`ToolResult`/`UndoOp`/`TaskUndoSnapshot`/`AgentToolDeps`/`ToolCallRecord`/`PermissionLevel`/`needsConfirm`/`toolByName`/`renderToolCatalog`/`runToolLoop`/`parseToolCalls`/`createAgentTaskStore`/`revertToolCall` are defined once (T1–T10) and used consistently downstream.

## Out of scope (follow-on specs)

- **L2** programmatic tool calling (sandboxed compose-by-code; `quickjs-emscripten`).
- **L3** skill creation + recall via the memory loop.
- Native provider function-calling (swappable behind `AgentTool`).
- Sharing tool contracts with `mcp/` (DRY consolidation).
