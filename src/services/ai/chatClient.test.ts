import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "./providers";

const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch }));

import { generateChat, streamChat } from "./chatClient";

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

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("generateChat", () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed text on a successful OpenAI response", async () => {
    fetch.mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "Hi there" } }] }));
    await expect(generateChat(settings(), chatInput)).resolves.toBe("Hi there");
  });

  it("throws when no API key is configured and does not call fetch", async () => {
    await expect(generateChat(settings({ aiApiKey: "" }), chatInput)).rejects.toThrow(/api key/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps a 401 to an API-key/Settings message", async () => {
    fetch.mockResolvedValue(jsonResponse(401, {}));
    await expect(generateChat(settings(), chatInput)).rejects.toThrow(/api key/i);
  });

  it("maps a 403 to an API-key/Settings message", async () => {
    fetch.mockResolvedValue(jsonResponse(403, {}));
    await expect(generateChat(settings(), chatInput)).rejects.toThrow(/api key/i);
  });

  it("maps a 429 to a rate-limit message", async () => {
    fetch.mockResolvedValue(jsonResponse(429, {}));
    await expect(generateChat(settings(), chatInput)).rejects.toThrow(/rate-limit/i);
  });

  it("maps a generic provider HTTP error to a status message", async () => {
    fetch.mockResolvedValue(jsonResponse(500, {}));
    await expect(generateChat(settings(), chatInput)).rejects.toThrow(/HTTP 500/);
  });

  it("surfaces a provider-supplied error detail when present", async () => {
    fetch.mockResolvedValue(jsonResponse(400, { error: { message: "bad request" } }));
    await expect(generateChat(settings(), chatInput)).rejects.toThrow("bad request");
  });

  it("throws a controlled empty-response error when the provider returns no content", async () => {
    fetch.mockResolvedValue(jsonResponse(200, { choices: [] }));
    await expect(generateChat(settings(), chatInput)).rejects.toThrow(/empty/i);
  });

  it("throws a controlled empty-response error for an empty Anthropic payload", async () => {
    fetch.mockResolvedValue(jsonResponse(200, { content: [] }));
    await expect(
      generateChat(settings({ aiProvider: "anthropic" }), chatInput)
    ).rejects.toThrow(/empty/i);
  });

  it("reconstructs canonical {tool_calls} JSON when Gemini returns a functionCall with no text", async () => {
    const geminiPayload = {
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: "list_tasks", args: { scope: "today" } } }]
          }
        }
      ]
    };
    fetch.mockResolvedValue(jsonResponse(200, geminiPayload));
    const result = await generateChat(settings({ aiProvider: "gemini" }), chatInput);
    expect(result).not.toBe("");
    expect(JSON.parse(result)).toEqual({
      tool_calls: [{ name: "list_tasks", args: { scope: "today" } }]
    });
  });
});

describe("streamChat v1 fallback (no usable stream body)", () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reconstructs canonical {tool_calls} JSON when Gemini returns a functionCall with no text", async () => {
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
    const result = await streamChat(
      settings({ aiProvider: "gemini" }),
      chatInput,
      { onToken: (c) => tokens.push(c) }
    );

    expect(result).not.toBe("");
    expect(JSON.parse(result)).toEqual({
      tool_calls: [{ name: "list_tasks", args: { scope: "today" } }]
    });
    expect(tokens).toHaveLength(1);
    expect(JSON.parse(tokens[0])).toEqual({
      tool_calls: [{ name: "list_tasks", args: { scope: "today" } }]
    });
  });
});
