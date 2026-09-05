import { describe, expect, it } from "vitest";
import {
  isOauthKey,
  planCredentialChange,
  planProviderFieldChange,
  planProviderSwitch,
  providerConfig,
  type ProviderCredentials
} from "./credentials";

function settings(overrides: Partial<ProviderCredentials> = {}): ProviderCredentials {
  return {
    aiProvider: "anthropic",
    aiApiKey: "",
    aiModel: "",
    aiBaseUrl: "",
    aiProviderConfigs: {},
    ...overrides
  };
}

describe("planProviderSwitch", () => {
  it("banks the current provider's setup before loading the next one's", () => {
    const patch = planProviderSwitch(
      settings({ aiApiKey: "sk-ant", aiModel: "claude-sonnet-5" }),
      "openai"
    );

    expect(patch.aiProvider).toBe("openai");
    expect(patch.aiProviderConfigs).toEqual({
      anthropic: { key: "sk-ant", model: "claude-sonnet-5" }
    });
    // Nothing was ever configured for OpenAI, so it starts empty rather than
    // inheriting a key that can only 401.
    expect(patch.aiApiKey).toBe("");
    expect(patch.aiModel).toBe("");
  });

  it("restores what a provider was last left with", () => {
    const patch = planProviderSwitch(
      settings({
        aiProvider: "openai",
        aiApiKey: "sk-openai",
        aiProviderConfigs: {
          ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.2" }
        }
      }),
      "ollama"
    );

    expect(patch.aiApiKey).toBe("");
    expect(patch.aiModel).toBe("llama3.2");
    expect(patch.aiBaseUrl).toBe("http://localhost:11434/v1");
    expect(patch.aiProviderConfigs?.openai).toEqual({ key: "sk-openai" });
  });

  it("clears the memory model, which is shared across providers", () => {
    const patch = planProviderSwitch(settings({ aiApiKey: "sk-ant" }), "gemini");
    expect(patch.assistantMemoryModel).toBe("");
  });

  it("is a no-op when the provider hasn't changed", () => {
    expect(planProviderSwitch(settings({ aiApiKey: "sk-ant" }), "anthropic")).toEqual({});
  });
});

describe("planCredentialChange", () => {
  it("writes the live key and the remembered one together", () => {
    const patch = planCredentialChange(settings(), "sk-ant-new");
    expect(patch.aiApiKey).toBe("sk-ant-new");
    expect(patch.aiProviderConfigs).toEqual({ anthropic: { key: "sk-ant-new" } });
  });

  it("marks a key that came from signing in", () => {
    const patch = planCredentialChange(
      settings({ aiProvider: "openrouter" }),
      "sk-or-issued",
      { oauth: true }
    );
    expect(patch.aiProviderConfigs).toEqual({
      openrouter: { key: "sk-or-issued", oauth: true }
    });
  });

  it("forgets the provider's entry when the key is cleared", () => {
    const patch = planCredentialChange(
      settings({
        aiProvider: "openrouter",
        aiApiKey: "sk-or-issued",
        aiProviderConfigs: { openrouter: { key: "sk-or-issued", oauth: true } }
      }),
      ""
    );
    expect(patch.aiApiKey).toBe("");
    expect(patch.aiProviderConfigs).toEqual({});
  });

  it("does not carry the oauth flag onto a key the user pasted over it", () => {
    const patch = planCredentialChange(
      settings({
        aiProvider: "openrouter",
        aiApiKey: "sk-or-issued",
        aiProviderConfigs: { openrouter: { key: "sk-or-issued", oauth: true } }
      }),
      "sk-or-pasted"
    );
    expect(patch.aiProviderConfigs).toEqual({ openrouter: { key: "sk-or-pasted" } });
  });
});

describe("planProviderFieldChange", () => {
  it("remembers a model against the provider it belongs to", () => {
    const patch = planProviderFieldChange(
      settings({ aiProvider: "gemini", aiApiKey: "key" }),
      "aiModel",
      "gemini-2.5-pro"
    );
    expect(patch.aiModel).toBe("gemini-2.5-pro");
    expect(patch.aiProviderConfigs).toEqual({ gemini: { model: "gemini-2.5-pro" } });
  });

  it("remembers an endpoint override", () => {
    const patch = planProviderFieldChange(
      settings({ aiProvider: "ollama" }),
      "aiBaseUrl",
      "http://192.168.1.4:11434/v1"
    );
    expect(patch.aiProviderConfigs).toEqual({
      ollama: { baseUrl: "http://192.168.1.4:11434/v1" }
    });
  });
});

describe("isOauthKey", () => {
  it("is true only for a key the provider issued through sign-in", () => {
    const signedIn = settings({
      aiProvider: "openrouter",
      aiApiKey: "sk-or",
      aiProviderConfigs: { openrouter: { key: "sk-or", oauth: true } }
    });
    expect(isOauthKey(signedIn)).toBe(true);
    expect(isOauthKey({ ...signedIn, aiApiKey: "" })).toBe(false);
    expect(isOauthKey(settings({ aiApiKey: "sk-ant" }))).toBe(false);
  });
});

describe("providerConfig", () => {
  it("reads as empty for a provider that was never set up", () => {
    expect(providerConfig(settings(), "groq")).toEqual({});
  });
});
