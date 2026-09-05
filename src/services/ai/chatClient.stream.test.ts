import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "./providers";

const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch }));

import { streamChatV2 } from "./chatClient";

function settings(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    aiProvider: "openai",
    aiApiKey: "test-key",
    aiModel: "",
    aiBaseUrl: "",
    ...overrides
  };
}

const chatInput = {
  system: "You are a planner.",
  messages: [{ role: "user" as const, content: "Plan my day" }]
};

function encode(chunks: string[]): Uint8Array[] {
  const enc = new TextEncoder();
  return chunks.map((c) => enc.encode(c));
}

/** Build a Response whose body is a ReadableStream of the given SSE lines. */
function sseResponse(lines: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const bytes of encode(lines)) controller.enqueue(bytes);
      controller.close();
    }
  });
  return new Response(stream, { status: 200 });
}

describe("streamChatV2", () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("streams OpenAI text deltas and accumulates tool_calls split across chunks", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"list_tasks"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"scope\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"today\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Done"}}]}\n\n',
        "data: [DONE]\n\n"
      ])
    );

    const tokens: string[] = [];
    const { text, toolCalls } = await streamChatV2(settings(), chatInput, {
      onToken: (c) => tokens.push(c)
    });

    expect(text).toBe("Done");
    expect(tokens).toEqual(["Done"]);
    expect(toolCalls).toEqual([{ name: "list_tasks", args: { scope: "today" } }]);
  });

  it("accumulates OpenAI tool_calls when name and arguments arrive together", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"list_tasks","arguments":"{\\"scope\\":\\"today\\"}"}}]}}]}\n\n',
        "data: [DONE]\n\n"
      ])
    );

    const tokens: string[] = [];
    const { text, toolCalls } = await streamChatV2(settings(), chatInput, {
      onToken: (c) => tokens.push(c)
    });

    expect(tokens.join("")).toBe("Hello");
    expect(text).toBe("Hello");
    expect(toolCalls).toEqual([{ name: "list_tasks", args: { scope: "today" } }]);
  });

  it("flags malformed OpenAI tool arguments as argsInvalid instead of silently executing {}", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"list_tasks","arguments":"not-json"}}]}}]}\n\n',
        "data: [DONE]\n\n"
      ])
    );

    const { text, toolCalls } = await streamChatV2(settings(), chatInput, {});

    expect(text).toBe("");
    expect(toolCalls).toEqual([{ name: "list_tasks", args: {}, argsInvalid: true }]);
  });

  it("accumulates Anthropic tool_use input_json_delta and finalizes on content_block_stop", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\"}}\n\n",
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_1\",\"name\":\"list_tasks\",\"input\":{}}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"scope\\\":\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\"today\\\"}\"}}\n\n",
        "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
        "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
      ])
    );

    const tokens: string[] = [];
    const { text, toolCalls } = await streamChatV2(
      settings({ aiProvider: "anthropic" }),
      chatInput,
      { onToken: (c) => tokens.push(c) }
    );

    expect(tokens).toEqual([]);
    expect(text).toBe("");
    expect(toolCalls).toEqual([{ name: "list_tasks", args: { scope: "today" }, id: "toolu_1" }]);
  });

  it("handles a mixed Anthropic turn (text + tool_use) in order", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Let me check \"}}\n\n",
        "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_1\",\"name\":\"list_tasks\",\"input\":{}}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"scope\\\":\\\"today\\\"}\"}}\n\n",
        "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n",
        "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
      ])
    );

    const tokens: string[] = [];
    const { text, toolCalls } = await streamChatV2(
      settings({ aiProvider: "anthropic" }),
      chatInput,
      { onToken: (c) => tokens.push(c) }
    );

    expect(tokens).toEqual(["Let me check "]);
    expect(text).toBe("Let me check ");
    expect(toolCalls).toEqual([{ name: "list_tasks", args: { scope: "today" }, id: "toolu_1" }]);
  });

  it("streams Gemini text and captures a streamed functionCall part", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Sure "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"thing"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"list_tasks","args":{"scope":"today"}}}]}}]}\n\n'
      ])
    );

    const tokens: string[] = [];
    const { text, toolCalls } = await streamChatV2(
      settings({ aiProvider: "gemini" }),
      chatInput,
      { onToken: (c) => tokens.push(c) }
    );

    expect(text).toBe("Sure thing");
    expect(tokens).toEqual(["Sure ", "thing"]);
    expect(toolCalls).toEqual([{ name: "list_tasks", args: { scope: "today" } }]);
  });

  it("aborts mid-stream and resolves with the accumulated partial without throwing", async () => {
    const ac = new AbortController();
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'));
        ac.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          controller.error(e);
        });
      }
    });
    fetch.mockResolvedValue(new Response(stream, { status: 200 }));

    const tokens: string[] = [];
    setTimeout(() => ac.abort(), 0);
    const result = await streamChatV2(settings(), chatInput, {
      onToken: (c) => tokens.push(c),
      signal: ac.signal
    });

    expect(result.text).toBe("Hel");
    expect(result.toolCalls).toEqual([]);
    expect(tokens).toEqual(["Hel"]);
  });

  it("falls back to parseAiResponse when response.body is not a usable stream", async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: undefined,
      text: async () => JSON.stringify({ choices: [{ message: { content: "Hello world" } }] })
    });

    const tokens: string[] = [];
    const { text, toolCalls } = await streamChatV2(settings(), chatInput, {
      onToken: (c) => tokens.push(c)
    });

    expect(text).toBe("Hello world");
    expect(tokens).toEqual(["Hello world"]);
    expect(toolCalls).toEqual([]);
  });

  it("does not emit onToken for a tool-only reply in the v2 fallback (no raw-JSON flash)", async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: undefined,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: "list_tasks", args: { scope: "today" } } }]
              }
            }
          ]
        })
    });

    const tokens: string[] = [];
    const { text, toolCalls } = await streamChatV2(
      settings({ aiProvider: "gemini" }),
      chatInput,
      { onToken: (c) => tokens.push(c) }
    );

    expect(tokens).toHaveLength(0);
    expect(JSON.parse(text)).toEqual({
      tool_calls: [{ name: "list_tasks", args: { scope: "today" } }]
    });
    expect(toolCalls).toEqual([{ name: "list_tasks", args: { scope: "today" } }]);
  });

  it("throws when no API key is configured", async () => {
    await expect(
      streamChatV2(settings({ aiApiKey: "" }), chatInput, {})
    ).rejects.toThrow(/api key/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends stream:true in the request body", async () => {
    fetch.mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    await streamChatV2(settings(), chatInput, {});
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
  });

  it("reports truncated:true when OpenAI ends with finish_reason length", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Half an ans"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
        "data: [DONE]\n\n"
      ])
    );
    const { text, truncated } = await streamChatV2(settings(), chatInput, {});
    expect(text).toBe("Half an ans");
    expect(truncated).toBe(true);
  });

  it("reports truncated:true when Anthropic stops with max_tokens", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Half"}}\n\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n'
      ])
    );
    const { text, truncated } = await streamChatV2(settings({ aiProvider: "anthropic" }), chatInput, {});
    expect(text).toBe("Half");
    expect(truncated).toBe(true);
  });

  it("retries once without temperature when the model rejects it (GPT-5/o-series)", async () => {
    fetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                "Unsupported value: 'temperature' does not support 0.3 with this model. Only the default (1) value is supported."
            }
          }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(sseResponse(['data: {"choices":[{"delta":{"content":"Done"}}]}\n\n', "data: [DONE]\n\n"]));

    const { text } = await streamChatV2(settings(), { ...chatInput, temperature: 0.3 }, {});

    expect(text).toBe("Done");
    expect(fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetch.mock.calls[0][1].body);
    const retryBody = JSON.parse(fetch.mock.calls[1][1].body);
    expect(firstBody.temperature).toBe(0.3);
    expect(retryBody.temperature).toBeUndefined();
  });

  it("does not retry a temperature 400 when no temperature was sent", async () => {
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Unsupported value: 'temperature'..." } }), { status: 400 })
    );
    await expect(streamChatV2(settings(), chatInput, {})).rejects.toThrow(/temperature/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("streamChatV2 against the Responses wire (ChatGPT/Codex)", () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  const codex = () => settings({ aiProvider: "chatgpt", aiApiKey: "access-token" });

  it("streams output_text deltas and reads a completed function call", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Two "}\n\n',
        'data: {"type":"response.output_text.delta","delta":"tasks left."}\n\n',
        'data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_7","name":"list_tasks","arguments":"{\\"scope\\":\\"today\\"}"}}\n\n',
        'data: {"type":"response.completed","response":{"status":"completed"}}\n\n'
      ])
    );

    const tokens: string[] = [];
    const result = await streamChatV2(codex(), chatInput, {
      onToken: (chunk) => tokens.push(chunk)
    });

    expect(tokens).toEqual(["Two ", "tasks left."]);
    expect(result.text).toBe("Two tasks left.");
    expect(result.toolCalls).toEqual([
      { name: "list_tasks", args: { scope: "today" }, id: "call_7" }
    ]);
  });

  it("ignores reasoning and lifecycle events it has no use for", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"response.created","response":{"id":"resp_1"}}\n\n',
        'data: {"type":"response.reasoning_summary_text.delta","delta":"thinking"}\n\n',
        'data: {"type":"response.output_text.delta","delta":"Answer"}\n\n'
      ])
    );

    const result = await streamChatV2(codex(), chatInput, {});
    expect(result.text).toBe("Answer");
  });

  it("marks a response cut short by the token limit", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"response.output_text.delta","delta":"half"}\n\n',
        'data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}\n\n'
      ])
    );

    const result = await streamChatV2(codex(), chatInput, {});
    expect(result.truncated).toBe(true);
    expect(result.text).toBe("half");
  });

  it("raises an error the provider streamed rather than returning a half answer", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
        'data: {"type":"response.failed","response":{"error":{"message":"usage limit reached"}}}\n\n'
      ])
    );

    await expect(streamChatV2(codex(), chatInput, {})).rejects.toThrow("usage limit reached");
  });
});
