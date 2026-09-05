import { describe, expect, it } from "vitest";
import { buildAiRequest, buildChatRequest, type AiSettings } from "./providers";
import {
  PROVIDERS,
  oauthConfig,
  requiresApiKey,
  resolveBaseUrl
} from "./providerCatalog";
import { buildModelsRequest } from "./models";
import type { AiProvider } from "../../types";

const ids = Object.keys(PROVIDERS) as AiProvider[];

function settings(overrides: Partial<AiSettings> = {}): AiSettings {
  return { aiProvider: "anthropic", aiApiKey: "key", aiModel: "", aiBaseUrl: "", ...overrides };
}

describe("the catalog", () => {
  it("keys every entry by its own id", () => {
    for (const id of ids) expect(PROVIDERS[id].id).toBe(id);
  });

  it("gives every provider an endpoint, or lets the user supply one", () => {
    for (const id of ids) {
      const def = PROVIDERS[id];
      expect(def.baseUrl.length > 0 || def.baseUrlEditable === true).toBe(true);
    }
  });

  it("never ships a base URL with a trailing slash", () => {
    for (const id of ids) expect(PROVIDERS[id].baseUrl).not.toMatch(/\/$/);
  });

  it("only offers sign-in where there is a flow to run", () => {
    for (const id of ids) {
      const def = PROVIDERS[id];
      const offersSignIn = def.auth === "oauthOrKey" || def.auth === "oauth";
      expect(offersSignIn, `${id} auth and oauth disagree`).toBe(def.oauth !== undefined);
    }
  });

  it("gives a sign-in-only provider no key field to leave empty", () => {
    for (const id of ids) {
      if (PROVIDERS[id].auth !== "oauth") continue;
      expect(PROVIDERS[id].apiKeyUrl).toBeUndefined();
    }
  });

  it("points every keyed provider at somewhere to get a key", () => {
    for (const id of ids) {
      const def = PROVIDERS[id];
      // Sign-in-only providers have no key to fetch, and `custom` is whatever
      // endpoint the user runs — we have nowhere to send them.
      if (def.auth === "none" || def.auth === "oauth" || id === "custom") continue;
      expect(def.apiKeyUrl, `${id} has no apiKeyUrl`).toBeTruthy();
    }
  });

  it("defaults to a model it also recommends", () => {
    for (const id of ids) {
      const def = PROVIDERS[id];
      if (def.defaultModel === "") continue;
      expect(def.models.map((model) => model.id)).toContain(def.defaultModel);
    }
  });
});

describe("every provider builds a usable request", () => {
  const input = { system: "system", prompt: "prompt" };

  it.each(ids)("%s", (id) => {
    // Local runtimes are configured with no key at all; everyone else has one.
    const config = settings({
      aiProvider: id,
      aiApiKey: requiresApiKey(id) ? "key" : "",
      aiModel: "test-model",
      // `custom` has no shipped endpoint — the user's is the only one.
      aiBaseUrl: PROVIDERS[id].baseUrl === "" ? "https://example.test/v1" : ""
    });

    for (const request of [buildAiRequest(config, input), buildChatRequest(config, { system: "s", messages: [] })]) {
      expect(request.url).toMatch(/^https?:\/\//);
      expect(request.headers["Content-Type"]).toBe("application/json");
    }
    // A provider that publishes no catalog says so with null rather than a
    // request that can only fail.
    const models = buildModelsRequest(config);
    if (models) expect(models.url).toMatch(/^https?:\/\//);
  });
});

describe("credentials on the wire", () => {
  it("sends no Authorization header to a local runtime that takes no key", () => {
    const request = buildAiRequest(settings({ aiProvider: "ollama", aiApiKey: "" }), {
      system: "s",
      prompt: "p"
    });
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.url).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("attributes gateway traffic to Yolo", () => {
    const request = buildAiRequest(settings({ aiProvider: "openrouter" }), {
      system: "s",
      prompt: "p"
    });
    expect(request.headers["X-Title"]).toBe("Yolo");
    expect(request.headers.Authorization).toBe("Bearer key");
  });

  it("keeps each wire protocol's own auth header", () => {
    expect(buildAiRequest(settings({ aiProvider: "anthropic" }), { system: "s", prompt: "p" })
      .headers["x-api-key"]).toBe("key");
    expect(buildAiRequest(settings({ aiProvider: "gemini" }), { system: "s", prompt: "p" })
      .headers["x-goog-api-key"]).toBe("key");
    expect(buildAiRequest(settings({ aiProvider: "deepseek" }), { system: "s", prompt: "p" })
      .headers.Authorization).toBe("Bearer key");
  });
});

describe("resolveBaseUrl", () => {
  it("prefers the user's endpoint where one is allowed", () => {
    expect(resolveBaseUrl("ollama", "http://192.168.1.4:11434/v1/")).toBe(
      "http://192.168.1.4:11434/v1"
    );
  });

  it("ignores an override for a provider whose endpoint is fixed", () => {
    expect(resolveBaseUrl("anthropic", "https://evil.test/v1")).toBe(
      "https://api.anthropic.com/v1"
    );
  });

  it("says what is missing when a custom endpoint has no URL", () => {
    expect(() => resolveBaseUrl("custom", " ")).toThrow(/base URL/);
  });
});

describe("oauthConfig", () => {
  it("is offered for OpenRouter and nothing that lacks a documented flow", () => {
    expect(oauthConfig("openrouter")?.exchange).toBe("apiKey");
    expect(oauthConfig("openai")).toBeNull();
  });
});
