import { describe, expect, it } from "vitest";
import { runToolLoop } from "./toolLoop";

describe("runToolLoop streaming", () => {
  it("streams final-answer tokens through onToken", async () => {
    const tokens: string[] = [];
    let step = 0;
    const generateChatV2 = async (
      _settings: unknown,
      _input: unknown,
      cb?: { onToken?: (chunk: string) => void }
    ) => {
      step += 1;
      if (step === 1) {
        cb?.onToken?.("Hello");
        cb?.onToken?.(" world");
        return { text: "Hello world", toolCalls: [] };
      }
      return { text: "Hello world", toolCalls: [] };
    };
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "hi" }],
        level: "auto",
        deps: {} as never,
        onToken: (chunk) => tokens.push(chunk),
        onStreamStep: () => {}
      },
      { generateChatV2: generateChatV2 as never }
    );
    expect(res.reply).toBe("Hello world");
    expect(tokens.join("")).toBe("Hello world");
  });

  it("signals reasoning for tool steps and final for the answer", async () => {
    const phases: Array<{ index: number; kind: string }> = [];
    let step = 0;
    const generateChatV2 = async (
      _settings: unknown,
      _input: unknown,
      cb?: { onToken?: (chunk: string) => void }
    ) => {
      step += 1;
      if (step === 1) {
        return { text: "", toolCalls: [{ name: "list_tasks", args: { scope: "today" } }] };
      }
      cb?.onToken?.("Done.");
      return { text: "Done.", toolCalls: [] };
    };
    const res = await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "x" }],
        level: "auto",
        deps: {
          store: {
            getAllTasks: () => [],
            getCategories: () => [],
            updateTask: async () => ({ ok: true }),
            createTask: async () => ({ ok: true, id: "c" }),
            deleteTask: async () => ({ ok: true }),
            startTask: async () => "started",
            pauseActiveTask: async () => ({ ok: true }),
            completeTask: async () => ({ ok: true }),
            dropTask: async () => ({ ok: true }),
            moveTaskToBacklog: async () => ({ ok: true }),
            ensureCategory: async () => "cat",
            refresh: async () => {}
          },
          ctx: {
            today: "2026-06-23",
            categories: [],
            tasks: [],
            backlog: [],
            assistantName: "Yolo",
            assistantSoul: "",
            allTaskRefs: []
          },
          insights: null,
          history: [],
          now: () => "u1"
        } as never,
        onStreamStep: (index, kind) => phases.push({ index, kind: String(kind) })
      },
      { generateChatV2: generateChatV2 as never }
    );
    expect(phases).toEqual([
      { index: 0, kind: "reasoning" },
      { index: 1, kind: "final" }
    ]);
    expect(res.reply).toBe("Done.");
  });

  it("forwards final tokens but not tool-step text in the native path", async () => {
    const tokens: string[] = [];
    let step = 0;
    const generateChatV2 = async (
      _settings: unknown,
      _input: unknown,
      cb?: { onToken?: (chunk: string) => void }
    ) => {
      step += 1;
      if (step === 1) {
        // Tool step: emits NO text tokens (only tool-call accumulation upstream).
        return { text: "", toolCalls: [{ name: "list_tasks", args: { scope: "today" } }] };
      }
      cb?.onToken?.("Final.");
      return { text: "Final.", toolCalls: [] };
    };
    await runToolLoop(
      {
        system: "sys",
        messages: [{ role: "user", content: "x" }],
        level: "auto",
        deps: {
          store: {
            getAllTasks: () => [],
            getCategories: () => [],
            updateTask: async () => ({ ok: true }),
            createTask: async () => ({ ok: true, id: "c" }),
            deleteTask: async () => ({ ok: true }),
            startTask: async () => "started",
            pauseActiveTask: async () => ({ ok: true }),
            completeTask: async () => ({ ok: true }),
            dropTask: async () => ({ ok: true }),
            moveTaskToBacklog: async () => ({ ok: true }),
            ensureCategory: async () => "cat",
            refresh: async () => {}
          },
          ctx: {
            today: "2026-06-23",
            categories: [],
            tasks: [],
            backlog: [],
            assistantName: "Yolo",
            assistantSoul: "",
            allTaskRefs: []
          },
          insights: null,
          history: [],
          now: () => "u1"
        } as never,
        onToken: (chunk) => tokens.push(chunk)
      },
      { generateChatV2: generateChatV2 as never }
    );
    expect(tokens.join("")).toBe("Final.");
  });
});
