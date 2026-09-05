import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Static rendering reads a store's *initial* snapshot, so the stores are
// stubbed rather than driven — this exercises the markup, not zustand.
const { state } = vi.hoisted(() => ({ state: { settings: {} as Record<string, unknown> } }));
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: (select: (store: unknown) => unknown) =>
    select({ settings: state.settings, updateSettings: vi.fn() })
}));
vi.mock("../../stores/uiStore", () => ({
  useUiStore: (select: (store: unknown) => unknown) => select({ addToast: vi.fn() })
}));

import { PROVIDERS } from "../../services/ai/providerCatalog";
import { DEFAULT_SETTINGS, type AiProvider, type AppSettings } from "../../types";
import { AiProviderFields } from "./AiProviderFields";

/** The provider section as it renders for a given configuration. */
function render(settings: Partial<AppSettings> = {}): string {
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  return renderToStaticMarkup(<AiProviderFields />);
}

describe("the provider picker", () => {
  it("offers every provider in the catalog, under a group heading", () => {
    const html = render();
    for (const id of Object.keys(PROVIDERS) as AiProvider[]) {
      expect(html, `${id} is missing from the picker`).toContain(`value="${id}"`);
    }
    expect(html).toContain("Model providers");
    expect(html).toContain("Gateways");
    expect(html).toContain("Local &amp; custom");
  });
});

describe("the credential field", () => {
  it("asks for a key, and says where to get one", () => {
    const html = render({ aiProvider: "anthropic" });
    expect(html).toContain("Paste your API key");
    expect(html).toContain("Get a key");
    expect(html).not.toContain("Sign in with");
  });

  it("offers sign-in only for a provider that supports it", () => {
    expect(render({ aiProvider: "openrouter" })).toContain("Sign in with OpenRouter");
    expect(render({ aiProvider: "openai" })).not.toContain("Sign in with");
  });

  it("marks in the dropdown which providers can be signed into", () => {
    const html = render();
    expect(html).toContain("OpenRouter — sign in or key");
    expect(html).toContain("ChatGPT (Codex sign-in) — sign in");
    expect(html).toContain(">OpenAI<");
  });

  it("shows only sign-in where there is no key to paste", () => {
    const html = render({ aiProvider: "chatgpt" });
    expect(html).toContain("Sign in with ChatGPT");
    expect(html).not.toContain("Paste your API key");
    expect(html).not.toContain("Get a key");
    // Say plainly what signing in here actually spends.
    expect(html).toContain("ChatGPT plan");
  });

  it("replaces the sign-in prompt with the account once signed in", () => {
    const html = render({
      aiProvider: "chatgpt",
      aiApiKey: "access-token",
      aiProviderConfigs: {
        chatgpt: { key: "access-token", oauth: true, refreshToken: "r", accountId: "acct-42" }
      }
    });
    expect(html).toContain("Signed in to ChatGPT (Codex sign-in)");
    expect(html).toContain("Disconnect");
    expect(html).not.toContain("Sign in with ChatGPT");
  });

  it("shows the signed-in state, with a way out, once a key was issued", () => {
    const html = render({
      aiProvider: "openrouter",
      aiApiKey: "sk-or-issued",
      aiProviderConfigs: { openrouter: { key: "sk-or-issued", oauth: true } }
    });
    expect(html).toContain("Signed in to OpenRouter");
    expect(html).toContain("Disconnect");
    expect(html).not.toContain("Paste your API key");
  });

  it("still shows the key field for a pasted key on the same provider", () => {
    const html = render({
      aiProvider: "openrouter",
      aiApiKey: "sk-or-pasted",
      aiProviderConfigs: { openrouter: { key: "sk-or-pasted" } }
    });
    expect(html).toContain("Paste your API key");
    expect(html).not.toContain("Signed in to");
  });

  it("never renders the key in readable text by default", () => {
    const html = render({ aiProvider: "anthropic", aiApiKey: "sk-ant-secret" });
    expect(html).toContain('type="password"');
  });

  it("asks for nothing from a model running on your own machine", () => {
    const html = render({ aiProvider: "ollama" });
    expect(html).toContain("Not needed");
    expect(html).toContain("runs on your own machine");
    expect(html).not.toContain("Paste your API key");
  });
});

describe("the endpoint field", () => {
  it("appears only where the endpoint is the user's to choose", () => {
    expect(render({ aiProvider: "ollama" })).toContain("Base URL");
    expect(render({ aiProvider: "custom" })).toContain("Base URL");
    expect(render({ aiProvider: "anthropic" })).not.toContain("Base URL");
  });

  it("names the default the field falls back to", () => {
    expect(render({ aiProvider: "ollama" })).toContain("http://localhost:11434/v1");
  });
});
