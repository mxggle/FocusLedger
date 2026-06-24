import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "./providers";

const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch }));

import { streamChat } from "./chatClient";

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

describe("streamChat", () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accumulates OpenAI delta chunks and forwards them to onToken", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        "data: [DONE]\n\n"
      ])
    );

    const tokens: string[] = [];
    const result = await streamChat(settings(), chatInput, { onToken: (c) => tokens.push(c) });

    expect(result).toBe("Hello");
    expect(tokens).toEqual(["Hel", "lo"]);
  });

  it("parses Anthropic content_block_delta events", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi "}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there"}}\n\n',
        "data: [DONE]\n\n"
      ])
    );

    const tokens: string[] = [];
    const result = await streamChat(
      settings({ aiProvider: "anthropic" }),
      chatInput,
      { onToken: (c) => tokens.push(c) }
    );

    expect(result).toBe("Hi there");
    expect(tokens).toEqual(["Hi ", "there"]);
  });

  it("parses Gemini SSE candidate parts", async () => {
    fetch.mockResolvedValue(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Part "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"two"}]}}]}\n\n'
      ])
    );

    const tokens: string[] = [];
    const result = await streamChat(
      settings({ aiProvider: "gemini" }),
      chatInput,
      { onToken: (c) => tokens.push(c) }
    );

    expect(result).toBe("Part two");
    expect(tokens).toEqual(["Part ", "two"]);
  });

  it("sends stream:true in the request body", async () => {
    fetch.mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    await streamChat(settings(), chatInput, {});
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
  });

  it("aborts mid-stream and resolves with the accumulated partial", async () => {
    const ac = new AbortController();
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'));
        // Second read only resolves (by erroring) once aborted.
        ac.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          controller.error(e);
        });
      }
    });
    fetch.mockResolvedValue(new Response(stream, { status: 200 }));

    const tokens: string[] = [];
    // Abort on the next tick so the first chunk is read first.
    setTimeout(() => ac.abort(), 0);
    const result = await streamChat(settings(), chatInput, {
      onToken: (c) => tokens.push(c),
      signal: ac.signal
    });

    expect(result).toBe("Hel");
    expect(tokens).toEqual(["Hel"]);
  });

  it("falls back to a single onToken when response.body is not a stream", async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: undefined,
      text: async () => JSON.stringify({ choices: [{ message: { content: "Hello world" } }] })
    });

    const tokens: string[] = [];
    const result = await streamChat(settings(), chatInput, { onToken: (c) => tokens.push(c) });

    expect(result).toBe("Hello world");
    expect(tokens).toEqual(["Hello world"]);
  });

  it("throws a friendly message on a 401", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      body: undefined,
      json: async () => ({ error: { message: "invalid api key" } })
    });
    await expect(streamChat(settings(), chatInput, {})).rejects.toThrow(/api key/i);
  });

  it("throws a rate-limit message on a 429", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 429,
      body: undefined,
      json: async () => ({})
    });
    await expect(streamChat(settings(), chatInput, {})).rejects.toThrow(/rate-limit/i);
  });

  it("reassembles a delta chunk split across two reads", async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Hel'));
        controller.enqueue(enc.encode('lo"}}]}\n\n'));
        controller.close();
      }
    });
    fetch.mockResolvedValue(new Response(stream, { status: 200 }));

    const tokens: string[] = [];
    const result = await streamChat(settings(), chatInput, { onToken: (c) => tokens.push(c) });

    expect(result).toBe("Hello");
    expect(tokens).toEqual(["Hello"]);
  });

  it("throws when no API key is configured", async () => {
    await expect(
      streamChat(settings({ aiApiKey: "" }), chatInput, {})
    ).rejects.toThrow(/api key/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
