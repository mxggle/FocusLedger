import { describe, expect, it } from "vitest";
import {
  buildAiRequest,
  buildChatRequest,
  extractErrorMessage,
  parseAiResponse,
  resolveModel,
  type AiSettings,
  type ChatInput
} from "./providers";

function settings(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    aiProvider: "anthropic",
    aiApiKey: "test-key",
    aiModel: "",
    aiBaseUrl: "",
    ...overrides
  };
}

const input = { system: "You are a coach.", prompt: "Debrief my day." };

describe("resolveModel", () => {
  it("falls back to the provider default when no model is set", () => {
    expect(resolveModel(settings())).toBe("claude-opus-4-8");
    expect(resolveModel(settings({ aiProvider: "openai" }))).toBe("gpt-5.1");
  });

  it("prefers the user override", () => {
    expect(resolveModel(settings({ aiModel: "claude-haiku-4-5" }))).toBe("claude-haiku-4-5");
  });
});

describe("buildAiRequest", () => {
  it("builds an Anthropic messages request", () => {
    const request = buildAiRequest(settings(), input);
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("test-key");
    expect(request.headers["anthropic-version"]).toBe("2023-06-01");
    expect(request.body).toMatchObject({
      model: "claude-opus-4-8",
      system: input.system,
      messages: [{ role: "user", content: input.prompt }]
    });
  });

  it("builds an OpenAI chat completions request", () => {
    const request = buildAiRequest(settings({ aiProvider: "openai" }), input);
    expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer test-key");
    expect(request.body).toMatchObject({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt }
      ]
    });
  });

  it("builds a Gemini generateContent request", () => {
    const request = buildAiRequest(settings({ aiProvider: "gemini" }), input);
    expect(request.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    );
    expect(request.headers["x-goog-api-key"]).toBe("test-key");
    expect(request.body).toMatchObject({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts: [{ text: input.prompt }] }]
    });
  });

  it("builds a custom OpenAI-compatible request against the base URL", () => {
    const request = buildAiRequest(
      settings({ aiProvider: "custom", aiBaseUrl: "http://localhost:11434/v1/", aiModel: "llama3" }),
      input
    );
    expect(request.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(request.body).toMatchObject({ model: "llama3" });
  });

  it("rejects a custom provider without a base URL", () => {
    expect(() => buildAiRequest(settings({ aiProvider: "custom" }), input)).toThrow(/base URL/i);
  });
});

describe("parseAiResponse", () => {
  it("parses Anthropic text blocks", () => {
    const payload = {
      content: [
        { type: "thinking", text: "hmm" },
        { type: "text", text: "Hello " },
        { type: "text", text: "world" }
      ]
    };
    expect(parseAiResponse("anthropic", payload)).toEqual({ text: "Hello world", toolCalls: [] });
  });

  it("parses Anthropic native tool_use blocks", () => {
    const payload = {
      content: [
        { type: "text", text: "Okay" },
        { type: "tool_use", name: "list_tasks", input: { scope: "today" } },
        { type: "tool_use", name: "update_task", input: { task_id: "t1" } }
      ]
    };
    expect(parseAiResponse("anthropic", payload)).toEqual({
      text: "Okay",
      toolCalls: [
        { name: "list_tasks", args: { scope: "today" } },
        { name: "update_task", args: { task_id: "t1" } }
      ]
    });
  });

  it("parses OpenAI choices", () => {
    const payload = { choices: [{ message: { content: "Hi there" } }] };
    expect(parseAiResponse("openai", payload)).toEqual({ text: "Hi there", toolCalls: [] });
    expect(parseAiResponse("custom", payload)).toEqual({ text: "Hi there", toolCalls: [] });
  });

  it("parses OpenAI native tool_calls", () => {
    const payload = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "c1", type: "function", function: { name: "list_tasks", arguments: '{"scope":"today"}' } },
              {
                id: "c2",
                type: "function",
                function: { name: "update_task", arguments: '{"task_id":"t1"}' }
              }
            ]
          }
        }
      ]
    };
    expect(parseAiResponse("openai", payload)).toEqual({
      text: "",
      toolCalls: [
        { name: "list_tasks", args: { scope: "today" } },
        { name: "update_task", args: { task_id: "t1" } }
      ]
    });
  });

  it("parses OpenAI tool_calls with malformed arguments as empty args", () => {
    const payload = {
      choices: [{ message: { content: null, tool_calls: [{ type: "function", function: { name: "noop", arguments: "not-json" } }] } }]
    };
    expect(parseAiResponse("openai", payload)).toEqual({ text: "", toolCalls: [{ name: "noop", args: {} }] });
  });

  it("parses Gemini candidates", () => {
    const payload = {
      candidates: [{ content: { parts: [{ text: "Part one. " }, { text: "Part two." }] } }]
    };
    expect(parseAiResponse("gemini", payload)).toEqual({ text: "Part one. Part two.", toolCalls: [] });
  });

  it("parses Gemini native function calls as structured tool calls", () => {
    const payload = {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: "list_tasks", args: { scope: "today" } } },
              {
                functionCall: {
                  name: "update_task",
                  args: { task_id: "t1", planned_start_time: "09:10" }
                }
              }
            ]
          }
        }
      ]
    };

    expect(parseAiResponse("gemini", payload)).toEqual({
      text: "",
      toolCalls: [
        { name: "list_tasks", args: { scope: "today" } },
        { name: "update_task", args: { task_id: "t1", planned_start_time: "09:10" } }
      ]
    });
  });

  it("throws on empty responses", () => {
    expect(() => parseAiResponse("openai", { choices: [] })).toThrow(/empty/i);
    expect(() => parseAiResponse("anthropic", {})).toThrow(/empty/i);
    expect(() => parseAiResponse("gemini", { candidates: [] })).toThrow(/empty/i);
    expect(() => parseAiResponse("gemini", { candidates: [{ content: { parts: [] } }] })).toThrow(/empty/i);
  });
});

describe("extractErrorMessage", () => {
  it("reads nested provider error messages", () => {
    expect(extractErrorMessage({ error: { message: "invalid x-api-key" } })).toBe(
      "invalid x-api-key"
    );
    expect(extractErrorMessage({ error: "bad request" })).toBe("bad request");
    expect(extractErrorMessage({})).toBeNull();
    expect(extractErrorMessage("nope")).toBeNull();
  });
});

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
    expect(req.body.model).toBe("claude-opus-4-8");
    expect(req.headers["x-api-key"]).toBe("test-key");
  });

  it("openai: system injected as first message", () => {
    const req = buildChatRequest(settings({ aiProvider: "openai" }), chatInput);
    expect(req.url).toBe("https://api.openai.com/v1/chat/completions");
    const msgs = req.body.messages as Array<{ role: string; content: string }>;
    expect(msgs[0]).toEqual({ role: "system", content: "You are a planner." });
    expect(msgs).toHaveLength(4);
  });

  it("openai: honors a user model override", () => {
    const req = buildChatRequest(settings({ aiProvider: "openai", aiModel: "gpt-4o-mini" }), chatInput);
    expect(req.body.model).toBe("gpt-4o-mini");
  });

  it("gemini: assistant role mapped to model, system as instruction", () => {
    const req = buildChatRequest(settings({ aiProvider: "gemini", aiModel: "gemini-2.5-flash" }), chatInput);
    expect(req.url).toContain("gemini-2.5-flash:generateContent");
    const contents = req.body.contents as Array<{ role: string }>;
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(req.body.systemInstruction).toEqual({ parts: [{ text: "You are a planner." }] });
  });

  it("gemini: includes native function declarations when chat tools are provided", () => {
    const req = buildChatRequest(settings({ aiProvider: "gemini", aiModel: "gemini-2.5-flash" }), {
      ...chatInput,
      tools: [
        {
          name: "list_tasks",
          description: "List tasks.",
          parameters: {
            type: "object",
            properties: { scope: { type: "string", enum: ["today", "backlog", "all"] } }
          }
        }
      ]
    });

    expect(req.body.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: "list_tasks",
            description: "List tasks.",
            parameters: {
              type: "object",
              properties: { scope: { type: "string", enum: ["today", "backlog", "all"] } }
            }
          }
        ]
      }
    ]);
  });

  it("custom: requires base url, posts to /chat/completions", () => {
    const req = buildChatRequest(
      settings({ aiProvider: "custom", aiBaseUrl: "http://localhost:11434/v1/" }),
      chatInput
    );
    expect(req.url).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("custom: rejects a chat request without a base URL", () => {
    expect(() => buildChatRequest(settings({ aiProvider: "custom" }), chatInput)).toThrow(/base URL/i);
  });

  it("stream: true adds stream to the body and switches Gemini to the SSE endpoint", () => {
    const anthropic = buildChatRequest(settings({ aiProvider: "anthropic" }), { ...chatInput, stream: true });
    expect(anthropic.body).toMatchObject({ stream: true });

    const openai = buildChatRequest(settings({ aiProvider: "openai" }), { ...chatInput, stream: true });
    expect(openai.body).toMatchObject({ stream: true });

    const gemini = buildChatRequest(
      settings({ aiProvider: "gemini", aiModel: "gemini-2.5-flash" }),
      { ...chatInput, stream: true }
    );
    expect(gemini.url).toContain(":streamGenerateContent?alt=sse");
    expect(gemini.body).not.toMatchObject({ stream: true });
  });

  it("stream omitted keeps the non-streaming Gemini endpoint and no stream flag", () => {
    const gemini = buildChatRequest(
      settings({ aiProvider: "gemini", aiModel: "gemini-2.5-flash" }),
      chatInput
    );
    expect(gemini.url).toContain(":generateContent");
    expect(gemini.body).not.toMatchObject({ stream: true });
  });
});

describe("buildChatRequest native tools", () => {
  const nativeSettings = { aiProvider: "openai", aiApiKey: "k", aiModel: "", aiBaseUrl: "" } as AiSettings;
  const tools = [
    { name: "list_tasks", description: "list", parameters: { type: "object", properties: {} } }
  ];

  it("serializes tools for openai as functions with tool_choice auto", () => {
    const req = buildChatRequest(nativeSettings, { system: "s", messages: [], tools });
    const body = req.body as Record<string, unknown>;
    const toolsArr = body.tools as Array<{ type: string; function: { name: string } }>;
    expect(toolsArr).toHaveLength(1);
    expect(toolsArr[0].type).toBe("function");
    expect(toolsArr[0].function.name).toBe("list_tasks");
    expect(body.tool_choice).toBe("auto");
  });

  it("omits tools when none supplied", () => {
    const req = buildChatRequest(nativeSettings, { system: "s", messages: [] });
    expect((req.body as Record<string, unknown>).tools).toBeUndefined();
    expect((req.body as Record<string, unknown>).tool_choice).toBeUndefined();
  });

  it("serializes tools for anthropic with input_schema", () => {
    const anthropicSettings = { ...nativeSettings, aiProvider: "anthropic" } as AiSettings;
    const req = buildChatRequest(anthropicSettings, { system: "s", messages: [], tools });
    const body = req.body as Record<string, unknown>;
    const toolsArr = body.tools as Array<{ name: string; input_schema: unknown }>;
    expect(toolsArr).toHaveLength(1);
    expect(toolsArr[0].name).toBe("list_tasks");
    expect(toolsArr[0].input_schema).toBeDefined();
  });

  it("custom provider also sends native functions with tool_choice auto", () => {
    const customSettings = { aiProvider: "custom", aiApiKey: "k", aiModel: "", aiBaseUrl: "http://localhost:11434/v1" } as AiSettings;
    const req = buildChatRequest(customSettings, { system: "s", messages: [], tools });
    const body = req.body as Record<string, unknown>;
    const toolsArr = body.tools as Array<{ type: string; function: { name: string } }>;
    expect(toolsArr[0].function.name).toBe("list_tasks");
    expect(body.tool_choice).toBe("auto");
  });
});
