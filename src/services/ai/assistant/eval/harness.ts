import { runAssistantToolTurn } from "../assistantRunner";
import type { AgentTaskStore } from "../agentTools/types";
import { AGENT_TOOLS } from "../agentTools/registry";
import type { ToolCallRecord, PermissionLevel } from "../agentTools/types";
import type { AssistantStoreSnapshot } from "../contextBuilder";
import type { ChatInput, ChatTurn } from "../../providers";
import type { Category, CreateTaskInput, Task, UpdateTaskInput } from "../../../../types";

export type EvalFixture = {
  today: string;
  tasks: Task[];
  backlogTasks?: Task[];
  categories?: Category[];
  allTasks: Task[];
  profile?: string;
  assistantName?: string;
  soul?: string;
  targetMinutes?: number;
  permissionLevel?: PermissionLevel;
};

export type ProviderCall = {
  settings: unknown;
  input: ChatInput;
};

export type EvalResult = {
  reply: string;
  records: ToolCallRecord[];
  store: InMemoryAgentStore;
  providerCalls: ProviderCall[];
  rawReplies: string[];
};

export const ALL_TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.name);

export class InMemoryAgentStore implements AgentTaskStore {
  tasks: Task[];
  categories: { id: string; name: string }[];
  calls: { method: string; args: unknown[] }[] = [];
  private seq = 100;

  constructor(tasks: Task[], categories: { id: string; name: string }[] = []) {
    this.tasks = tasks.map((task) => ({ ...task }));
    this.categories = categories.map((category) => ({ ...category }));
  }

  getAllTasks(): Task[] {
    return this.tasks;
  }
  getCategories(): { id: string; name: string }[] {
    return this.categories;
  }

  async createTask(input: CreateTaskInput): Promise<{ ok: boolean; id?: string; message?: string }> {
    this.calls.push({ method: "createTask", args: [input] });
    const id = `task-created-${this.seq++}`;
    const base: Task = {
      id,
      title: input.title,
      description: input.description ?? null,
      category_id: input.category_id ?? null,
      status: "todo",
      priority: input.priority ?? "medium",
      estimated_minutes: input.estimated_minutes ?? null,
      due_date: input.due_date ?? null,
      template_id: input.template_id ?? null,
      planned_start_time: input.planned_start_time ?? null,
      planned_end_time: input.planned_end_time ?? null,
      sort_order: input.sort_order ?? null,
      created_at: "2026-06-23T09:00:00Z",
      updated_at: "u1",
      completed_at: null,
      dropped_at: null
    };
    this.tasks.push(base);
    return { ok: true, id };
  }

  async updateTask(id: string, input: UpdateTaskInput): Promise<{ ok: boolean; message?: string }> {
    this.calls.push({ method: "updateTask", args: [id, input] });
    const task = this.tasks.find((entry) => entry.id === id);
    if (!task) return { ok: false, message: `Unknown task ${id}` };
    Object.assign(task, input);
    task.updated_at = "u1";
    return { ok: true };
  }

  async deleteTask(id: string): Promise<{ ok: boolean; message?: string }> {
    this.calls.push({ method: "deleteTask", args: [id] });
    this.tasks = this.tasks.filter((entry) => entry.id !== id);
    return { ok: true };
  }

  startTask(id: string): Promise<"started" | "failed"> {
    this.calls.push({ method: "startTask", args: [id] });
    const task = this.tasks.find((entry) => entry.id === id);
    if (!task) return Promise.resolve("failed");
    task.status = "doing";
    task.updated_at = "u1";
    return Promise.resolve("started");
  }

  async pauseActiveTask(): Promise<{ ok: boolean; message?: string }> {
    this.calls.push({ method: "pauseActiveTask", args: [] });
    const task = this.tasks.find((entry) => entry.status === "doing");
    if (task) {
      task.status = "paused";
      task.updated_at = "u1";
    }
    return { ok: true };
  }

  async completeTask(id: string, note?: string): Promise<{ ok: boolean; message?: string }> {
    this.calls.push({ method: "completeTask", args: [id, note] });
    const task = this.tasks.find((entry) => entry.id === id);
    if (!task) return { ok: false, message: `Unknown task ${id}` };
    task.status = "done";
    task.completed_at = "2026-06-23T12:00:00Z";
    task.updated_at = "u1";
    return { ok: true };
  }

  async dropTask(id: string): Promise<{ ok: boolean; message?: string }> {
    this.calls.push({ method: "dropTask", args: [id] });
    const task = this.tasks.find((entry) => entry.id === id);
    if (!task) return { ok: false, message: `Unknown task ${id}` };
    task.status = "dropped";
    task.dropped_at = "2026-06-23T12:00:00Z";
    task.updated_at = "u1";
    return { ok: true };
  }

  async moveTaskToBacklog(id: string): Promise<{ ok: boolean; message?: string }> {
    this.calls.push({ method: "moveTaskToBacklog", args: [id] });
    const task = this.tasks.find((entry) => entry.id === id);
    if (!task) return { ok: false, message: `Unknown task ${id}` };
    task.due_date = null;
    task.planned_start_time = null;
    task.planned_end_time = null;
    task.updated_at = "u1";
    return { ok: true };
  }

  async ensureCategory(name: string): Promise<string> {
    this.calls.push({ method: "ensureCategory", args: [name] });
    const lower = name.trim().toLowerCase();
    const existing = this.categories.find((category) => category.name.toLowerCase() === lower);
    if (existing) return existing.id;
    const id = `cat-${this.seq++}`;
    this.categories.push({ id, name: name.trim() });
    return id;
  }

  refresh(): Promise<void> {
    return Promise.resolve();
  }

  taskById(id: string): Task | undefined {
    return this.tasks.find((entry) => entry.id === id);
  }

  callsByMethod(method: string): { method: string; args: unknown[] }[] {
    return this.calls.filter((entry) => entry.method === method);
  }
}

export function toolCallNames(records: ToolCallRecord[]): string[] {
  return records.map((record) => record.name);
}

export function containsSubsequence(haystack: string[], needle: string[]): boolean {
  let i = 0;
  for (const item of haystack) {
    if (item === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return i === needle.length;
}

const TASK_ID_BRACKET_RE = /\[(?:task[_-]?)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]/i;
const TOOL_NAME_RE = new RegExp(`\\b(${ALL_TOOL_NAMES.join("|")})\\b`);

export function replyHasInternalIds(reply: string): boolean {
  return TASK_ID_BRACKET_RE.test(reply);
}

export function replyHasToolNames(reply: string): boolean {
  return TOOL_NAME_RE.test(reply);
}

export async function runEval(opts: {
  prompt: string;
  fixture: EvalFixture;
  replies: string[];
}): Promise<EvalResult> {
  const store = new InMemoryAgentStore(opts.fixture.allTasks, opts.fixture.categories ?? []);
  const snapshot: AssistantStoreSnapshot = {
    selectedDate: opts.fixture.today,
    tasks: opts.fixture.tasks,
    backlogTasks: opts.fixture.backlogTasks ?? [],
    categories: opts.fixture.categories ?? [],
    allTasks: opts.fixture.allTasks,
    profile: opts.fixture.profile,
    assistantName: opts.fixture.assistantName,
    assistantSoul: opts.fixture.soul,
    targetMinutes: opts.fixture.targetMinutes,
    permissionLevel: opts.fixture.permissionLevel
  };

  const providerCalls: ProviderCall[] = [];
  const rawReplies: string[] = [];
  let i = 0;
  const generateChat = async (settings: unknown, input: ChatInput): Promise<string> => {
    providerCalls.push({ settings, input });
    const reply = opts.replies[i++] ?? "";
    rawReplies.push(reply);
    return reply;
  };

  const result = await runAssistantToolTurn(
    {
      settings: { aiProvider: "anthropic", aiApiKey: "test-key", aiModel: "", aiBaseUrl: "" },
      snapshot,
      messages: [{ role: "user", content: opts.prompt }] as ChatTurn[]
    },
    { generateChat, store, now: () => `${opts.fixture.today}T12:00:00.000+00:00` }
  );

  return { reply: result.reply, records: result.toolCalls, store, providerCalls, rawReplies };
}
