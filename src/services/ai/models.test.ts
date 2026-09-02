import { describe, expect, it } from "vitest";
import {
  CURATED_MODELS,
  buildModelsRequest,
  mergeModelOptions,
  parseModelsResponse
} from "./models";
import type { AiSettings } from "./providers";

function settings(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    aiProvider: "anthropic",
    aiApiKey: "key-123",
    aiModel: "",
    aiBaseUrl: "",
    ...overrides
  };
}

describe("buildModelsRequest", () => {
  it("authenticates each provider the way its catalog endpoint expects", () => {
    expect(buildModelsRequest(settings())).toEqual({
      url: "https://api.anthropic.com/v1/models?limit=100",
      headers: { "x-api-key": "key-123", "anthropic-version": "2023-06-01" }
    });
    expect(buildModelsRequest(settings({ aiProvider: "openai" }))?.headers).toEqual({
      Authorization: "Bearer key-123"
    });
    expect(buildModelsRequest(settings({ aiProvider: "gemini" }))?.headers).toEqual({
      "x-goog-api-key": "key-123"
    });
  });

  it("joins a custom base URL without doubling the slash", () => {
    const request = buildModelsRequest(
      settings({ aiProvider: "custom", aiBaseUrl: "http://localhost:11434/v1/" })
    );
    expect(request?.url).toBe("http://localhost:11434/v1/models");
  });

  it("returns null when there is nothing to ask with", () => {
    expect(buildModelsRequest(settings({ aiApiKey: "  " }))).toBeNull();
    expect(buildModelsRequest(settings({ aiProvider: "custom", aiBaseUrl: "" }))).toBeNull();
  });
});

describe("parseModelsResponse", () => {
  it("reads Anthropic display names, falling back to the id", () => {
    const options = parseModelsResponse("anthropic", {
      data: [
        { id: "claude-opus-5", display_name: "Claude Opus 5" },
        { id: "claude-haiku-4-5" },
        { display_name: "no id" }
      ]
    });
    expect(options).toEqual([
      { id: "claude-opus-5", label: "Claude Opus 5" },
      { id: "claude-haiku-4-5", label: "claude-haiku-4-5" }
    ]);
  });

  it("drops OpenAI models that cannot answer a chat turn", () => {
    const options = parseModelsResponse("openai", {
      data: [{ id: "gpt-5.1" }, { id: "text-embedding-3-small" }, { id: "whisper-1" }]
    });
    expect(options.map((option) => option.id)).toEqual(["gpt-5.1"]);
  });

  it("keeps only Gemini models that support generateContent", () => {
    const options = parseModelsResponse("gemini", {
      models: [
        {
          name: "models/gemini-2.5-flash",
          displayName: "Gemini 2.5 Flash",
          supportedGenerationMethods: ["generateContent", "countTokens"]
        },
        {
          name: "models/text-embedding-004",
          supportedGenerationMethods: ["embedContent"]
        }
      ]
    });
    expect(options).toEqual([{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }]);
  });

  it("survives a payload it does not recognise", () => {
    expect(parseModelsResponse("anthropic", null)).toEqual([]);
    expect(parseModelsResponse("openai", { error: "nope" })).toEqual([]);
  });
});

describe("mergeModelOptions", () => {
  const curated = CURATED_MODELS.anthropic;

  it("shows the whole shortlist when the provider was never asked", () => {
    expect(mergeModelOptions(curated, [])).toEqual(curated);
  });

  it("keeps curated entries first and hides ones the key cannot reach", () => {
    const merged = mergeModelOptions(curated, [
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" }
    ]);
    expect(merged.map((option) => option.id)).toEqual([
      "claude-sonnet-5",
      "claude-opus-4-6",
      "claude-opus-4-7"
    ]);
    // The curated entry keeps its hint; the rest come through as reported.
    expect(merged[0].hint).toBe("Balanced");
    expect(merged[1].hint).toBeUndefined();
  });
});
