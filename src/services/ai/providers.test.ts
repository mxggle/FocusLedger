import { describe, expect, it } from "vitest";
import {
  buildAiRequest,
  extractErrorMessage,
  parseAiResponse,
  resolveModel,
  type AiSettings
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
    expect(parseAiResponse("anthropic", payload)).toBe("Hello world");
  });

  it("parses OpenAI choices", () => {
    const payload = { choices: [{ message: { content: "Hi there" } }] };
    expect(parseAiResponse("openai", payload)).toBe("Hi there");
    expect(parseAiResponse("custom", payload)).toBe("Hi there");
  });

  it("parses Gemini candidates", () => {
    const payload = {
      candidates: [{ content: { parts: [{ text: "Part one. " }, { text: "Part two." }] } }]
    };
    expect(parseAiResponse("gemini", payload)).toBe("Part one. Part two.");
  });

  it("throws on empty responses", () => {
    expect(() => parseAiResponse("openai", { choices: [] })).toThrow(/empty/i);
    expect(() => parseAiResponse("anthropic", {})).toThrow(/empty/i);
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
