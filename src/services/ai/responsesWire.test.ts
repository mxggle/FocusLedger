import { describe, expect, it } from "vitest";
import { buildChatRequest, parseAiResponse, type AiSettings, type ChatInput } from "./providers";
import { PROVIDERS } from "./providerCatalog";

/**
 * The ChatGPT/Codex endpoint speaks the Responses API rather than chat
 * completions: tool calls and their results are top-level items paired by
 * `call_id`, the system prompt is `instructions`, and every answer is a stream.
 */
function settings(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    aiProvider: "chatgpt",
    aiApiKey: "access-token",
    aiModel: "",
    aiBaseUrl: "",
    ...overrides
  };
}

const input: ChatInput = {
  system: "You are a planner.",
  messages: [{ role: "user", content: "Plan my day" }]
};

describe("the Responses request", () => {
  it("posts to the Codex responses endpoint with the signed-in token", () => {
    const request = buildChatRequest(settings(), input);
    expect(request.url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(request.headers.Authorization).toBe("Bearer access-token");
    expect(request.headers["OpenAI-Beta"]).toBe("responses=experimental");
    expect(request.headers.session_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("names the account when the sign-in told us one", () => {
    const withAccount = settings({
      aiProviderConfigs: { chatgpt: { key: "access-token", oauth: true, accountId: "acct-42" } }
    });
    expect(buildChatRequest(withAccount, input).headers["chatgpt-account-id"]).toBe("acct-42");
    // Without one we must send no header at all rather than an empty value.
    expect(buildChatRequest(settings(), input).headers["chatgpt-account-id"]).toBeUndefined();
  });

  it("always streams, never stores, and carries the system prompt as instructions", () => {
    const body = buildChatRequest(settings(), input).body;
    expect(body).toMatchObject({
      // Which id that is rotates with OpenAI's lineup; that it is the one the
      // catalog vouches for is the part worth pinning.
      model: PROVIDERS.chatgpt.defaultModel,
      instructions: "You are a planner.",
      stream: true,
      store: false
    });
  });

  it("omits temperature, which these models reject", () => {
    const body = buildChatRequest(settings(), { ...input, temperature: 0.2 }).body;
    expect(body).not.toHaveProperty("temperature");
  });

  it("turns a plain turn into a message item", () => {
    const body = buildChatRequest(settings(), input).body as { input: unknown[] };
    expect(body.input).toEqual([
      { type: "message", role: "user", content: [{ type: "input_text", text: "Plan my day" }] }
    ]);
  });

  it("lifts tool calls and their results into top-level items paired by call id", () => {
    const body = buildChatRequest(settings(), {
      system: "s",
      messages: [
        { role: "user", content: "What's left today?" },
        {
          role: "assistant",
          content: "Checking.",
          toolCalls: [{ id: "call_1", name: "list_tasks", args: { when: "today" } }]
        },
        {
          role: "user",
          content: "",
          toolResults: [{ id: "call_1", name: "list_tasks", content: "2 tasks" }]
        }
      ]
    }).body as { input: Record<string, unknown>[] };

    expect(body.input).toEqual([
      { type: "message", role: "user", content: [{ type: "input_text", text: "What's left today?" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "Checking." }] },
      {
        type: "function_call",
        call_id: "call_1",
        name: "list_tasks",
        arguments: JSON.stringify({ when: "today" })
      },
      { type: "function_call_output", call_id: "call_1", output: "2 tasks" }
    ]);
  });

  it("declares tools in the flat Responses shape", () => {
    const body = buildChatRequest(settings(), {
      ...input,
      tools: [{ name: "list_tasks", description: "List tasks", parameters: { type: "object" } }]
    }).body as { tools: Record<string, unknown>[] };

    // Chat completions nests these under `function`; Responses does not.
    expect(body.tools[0]).toEqual({
      type: "function",
      name: "list_tasks",
      description: "List tasks",
      parameters: { type: "object" }
    });
  });
});

describe("parsing a Responses body", () => {
  it("joins the output text", () => {
    const parsed = parseAiResponse("chatgpt", {
      output: [
        { type: "message", content: [{ type: "output_text", text: "Two " }] },
        { type: "message", content: [{ type: "output_text", text: "tasks left." }] }
      ]
    });
    expect(parsed.text).toBe("Two tasks left.");
    expect(parsed.toolCalls).toEqual([]);
  });

  it("reads a function call, keeping its call id for the reply", () => {
    const parsed = parseAiResponse("chatgpt", {
      output: [
        {
          type: "function_call",
          call_id: "call_9",
          name: "start_timer",
          arguments: '{"taskId":"t1"}'
        }
      ]
    });
    expect(parsed.toolCalls).toEqual([
      { name: "start_timer", args: { taskId: "t1" }, id: "call_9" }
    ]);
  });

  it("flags malformed arguments instead of running the tool with defaults", () => {
    const parsed = parseAiResponse("chatgpt", {
      output: [{ type: "function_call", call_id: "c", name: "delete_task", arguments: "{oops" }]
    });
    expect(parsed.toolCalls[0]).toMatchObject({ argsInvalid: true, args: {} });
  });

  it("reports a response cut short by the token limit", () => {
    const parsed = parseAiResponse("chatgpt", {
      output: [{ type: "message", content: [{ type: "output_text", text: "half" }] }],
      incomplete_details: { reason: "max_output_tokens" }
    });
    expect(parsed.truncated).toBe(true);
  });
});
